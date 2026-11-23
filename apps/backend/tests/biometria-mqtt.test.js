const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");
const mqtt = require("mqtt");
const request = require("supertest");
const { once } = require("node:events");

const basePrueba = process.env.BIOMETRIA_TEST_DATABASE_URL;
const brokerPrueba = process.env.BIOMETRIA_TEST_MQTT_URL;
const lector = "lector-prueba";
const lectorAjeno = "lector-otro-lab";
const claves = { [lector]: "12".repeat(32), [lectorAjeno]: "34".repeat(32) };
if (basePrueba || brokerPrueba) {
  const pg = new URL(basePrueba);
  const broker = new URL(brokerPrueba);
  if (!["postgres:", "postgresql:"].includes(pg.protocol) || pg.hostname !== "127.0.0.1"
    || !pg.port || pg.pathname !== "/labassist_biometria_test" || pg.search
    || broker.protocol !== "mqtt:" || broker.hostname !== "127.0.0.1" || !broker.port || broker.port === "1883") {
    throw new Error("La prueba requiere PostgreSQL y MQTT locales dedicados");
  }
  process.env.DATABASE_URL = basePrueba;
  process.env.MQTT_URL = brokerPrueba;
  process.env.MQTT_DEVICE_ID = lector;
  process.env.JWT_SECRET = "jwt-prueba-biometria";
  process.env.BIOMETRIA_CLAVES_JSON = JSON.stringify(claves);
}

const app = require("../src/app");
const { obtenerPool, cerrarPool } = require("../src/database/pool");
const { ejecutarMigraciones } = require("../src/database/migrate");
const { iniciarRecepcionMQTT } = require("../src/modules/biometria/biometria.service");
const raiz = "/api/v1";
const prefijo = "labassist/biometria";
const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

(basePrueba && brokerPrueba ? describe : describe.skip)("Biometría sobre PostgreSQL y MQTT", () => {
  let db, cliente, backend, tecnico, otroTecnico, alumno, laboratorio, pc, captura, sesion, modo, reserva;
  const recibidos = [];
  let indice = 0;

  function autenticar(llamada, actor = tecnico) {
    return llamada.auth(jwt.sign({ sub: String(actor) }, process.env.JWT_SECRET), { type: "bearer" });
  }
  const post = (ruta, datos = {}, actor) => autenticar(request(app).post(raiz + ruta), actor).send(datos);
  const get = (ruta, actor) => autenticar(request(app).get(raiz + ruta), actor);
  const firma = (topic, datos, clave) => crypto.createHmac("sha256", Buffer.from(clave, "hex"))
    .update(topic + "\n" + datos).digest("hex");

  async function emitir(operacion, campos, id = lector, clave = claves[id]) {
    const topic = `${prefijo}/${id}/eventos`;
    const datos = JSON.stringify({ operacion, dispositivo_id: id, ...campos });
    await cliente.publishAsync(topic, JSON.stringify({ datos, firma: firma(topic, datos, clave) }), { qos: 1 });
  }

  async function siguiente(operacion) {
    for (let intento = 0; intento < 100; intento++) {
      const encontrado = recibidos.slice(indice).findIndex((dato) => dato.operacion === operacion);
      if (encontrado >= 0) {
        indice += encontrado + 1;
        return recibidos[indice - 1];
      }
      await esperar(20);
    }
    throw new Error("MQTT no entregó " + operacion);
  }

  const presente = (id = lector) => emitir("ESTADO", {
    emitido_en: Date.now(), listo: true, slots_ocupados: [1],
  }, id);

  async function crearTecnico(numero) {
    const correo = `tecnico-${numero}@example.test`;
    const { rows: [{ id }] } = await db.query(
      "INSERT INTO usuario (nombre, apellido, cedula, correo) VALUES ('Fixture', 'Técnico', $1, $2) RETURNING id",
      [String(numero).padStart(10, "0"), correo]
    );
    await db.query("INSERT INTO cuenta (usuario_id, cuenta, clave) VALUES ($1, $2, 'fixture')", [id, correo]);
    await db.query("INSERT INTO tecnico_docente VALUES ($1)", [id]);
    return id;
  }

  beforeAll(async () => {
    db = obtenerPool();
    const { rows: [entorno] } = await db.query(
      "SELECT current_database() AS nombre, to_regclass('public.migracion') AS migracion"
    );
    if (entorno.nombre !== "labassist_biometria_test" || entorno.migracion) throw new Error("Base biométrica de prueba no vacía");
    await ejecutarMigraciones(db);
    tecnico = await crearTecnico(1);
    otroTecnico = await crearTecnico(2);
    const { body } = await post("/laboratorios", { codigo: "BIO", nombre: "Biometría", cantidad_computadoras: 2 });
    laboratorio = body.data.laboratorio.id;
    const otro = await post("/laboratorios", { codigo: "OTRO", nombre: "Otro", cantidad_computadoras: 1 });
    await db.query("INSERT INTO biometria_lector (id, laboratorio_id, capacidad) VALUES ($1,$2,6),($3,$4,6)",
      [lector, laboratorio, lectorAjeno, otro.body.data.laboratorio.id]);
    pc = (await get("/ocupacion/laboratorios/" + laboratorio)).body.data.computadoras[0].id;
    backend = iniciarRecepcionMQTT();
    await once(backend, "connect");
    cliente = mqtt.connect(brokerPrueba);
    await once(cliente, "connect");
    cliente.on("message", (topic, mensaje) => {
      const sobre = JSON.parse(mensaje.toString());
      const datos = JSON.parse(sobre.datos);
      if (firma(topic, sobre.datos, claves[datos.dispositivo_id]) === sobre.firma) recibidos.push(datos);
    });
    await cliente.subscribeAsync([prefijo + "/+/comandos", prefijo + "/+/respuestas"], { qos: 1 });
  }, 15000);

  afterAll(async () => {
    await Promise.all([cliente?.endAsync(true), backend?.endAsync(true)]);
    await cerrarPool();
  });

  test("asigna un slot libre, autentica resultados y vincula una captura de un solo uso al estudiante", async () => {
    expect((await post("/biometria/capturas")).status).toBe(503);
    await presente();
    await esperar(100);
    const solicitudes = await Promise.all([post("/biometria/capturas"), post("/biometria/capturas")]);
    expect(solicitudes.map((r) => r.status).sort()).toEqual([201, 409]);
    captura = solicitudes.find((r) => r.status === 201).body.data;
    expect(captura.slot).toBe(2);
    expect(await siguiente("ENROLAR")).toMatchObject({ captura_id: captura.captura_id, slot: 2, dispositivo_id: lector });

    const resultado = { captura_id: captura.captura_id, slot: 2, resultado: "OK", plantilla: "AQIDBA==" };
    const ruta = "/biometria/capturas/" + captura.captura_id;
    await emitir("RESULTADO_ENROLAR", resultado, lector, claves[lectorAjeno]);
    await esperar(100);
    expect((await get(ruta)).body.data.captura.estado).toBe("PENDIENTE");
    await emitir("RESULTADO_ENROLAR", { ...resultado, slot: 3 });
    expect(await siguiente("ACUSE_ENROLAR")).toMatchObject({ resultado: "RECHAZADO", slot: 3 });
    await emitir("RESULTADO_ENROLAR", resultado);
    expect(await siguiente("ACUSE_ENROLAR")).toMatchObject({ resultado: "ACEPTADO", slot: 2 });
    await emitir("RESULTADO_ENROLAR", resultado);
    expect(await siguiente("ACUSE_ENROLAR")).toMatchObject({ resultado: "ACEPTADO", slot: 2 });
    expect((await get(ruta, otroTecnico)).status).toBe(404);

    const datos = { nombre: "Ana", apellido: "Fixture", cedula: "0100000009", correo: "ana-fixture@unl.edu.ec",
      carrera: "Computación", ciclo: "1", captura_id: captura.captura_id };
    expect((await post("/auth/registro", datos, otroTecnico)).body.error.codigo).toBe("CAPTURA_INVALIDA");
    const registro = await post("/auth/registro", datos);
    expect(registro.status).toBe(201);
    alumno = registro.body.data.usuario.id;
    const { rows: [huella] } = await db.query("SELECT * FROM huella_estudiante WHERE usuario_id = $1", [alumno]);
    expect(huella).toMatchObject({ dispositivo_id: lector, slot: 2, plantilla: "AQIDBA==" });
    expect((await get(ruta)).body.data.captura.estado).toBe("USADA");
    await db.query("UPDATE cuenta SET debe_cambiar_contrasena = FALSE WHERE usuario_id = $1", [alumno]);

    const segunda = (await post("/biometria/capturas")).body.data;
    expect(await siguiente("ENROLAR")).toMatchObject({ captura_id: segunda.captura_id, slot: 3 });
    await emitir("RESULTADO_ENROLAR", { captura_id: segunda.captura_id, slot: 3, resultado: "ERROR", codigo: "SLOT_OCUPADO" });
    expect(await siguiente("ACUSE_ENROLAR")).toMatchObject({ resultado: "ACEPTADO" });
    expect((await get("/biometria/capturas/" + segunda.captura_id)).body.data.captura.estado).toBe("ERROR");

    const tercera = (await autenticar(request(app).post(raiz + "/biometria/capturas"))).body.data;
    expect(await siguiente("ENROLAR")).toMatchObject({ captura_id: tercera.captura_id, slot: 4 });
    await db.query("UPDATE biometria_captura SET expira_en = now() WHERE id = $1", [tercera.captura_id]);
    await emitir("RESULTADO_ENROLAR", { ...resultado, captura_id: tercera.captura_id, slot: 4 });
    expect(await siguiente("ACUSE_ENROLAR")).toMatchObject({ resultado: "RECHAZADO" });
    expect((await get("/biometria/capturas/" + tercera.captura_id)).body.data.captura.estado).toBe("EXPIRADA");
    const cuarta = (await post("/biometria/capturas")).body.data;
    expect(await siguiente("ENROLAR")).toMatchObject({ captura_id: cuarta.captura_id, slot: 5 });
  });

  test("autoriza solo al lector y a la reserva correctos y confirma duplicados una sola vez", async () => {
    await presente();
    await presente(lectorAjeno);
    await esperar(80);
    expect((await post("/biometria/identificacion")).status).toBe(409);
    const abierta = await post("/ocupacion/laboratorios/" + laboratorio + "/sesiones");
    sesion = abierta.body.data.sesion.id;
    reserva = (await post("/reservas", { sesionId: sesion, computadoraId: pc }, alumno)).body.data.id;
    expect((await post("/biometria/identificacion", { dispositivo_id: lectorAjeno })).status).toBe(409);
    const activar = await post("/biometria/identificacion");
    expect(activar.status).toBe(202);
    modo = activar.body.data.modo_id;
    expect(await siguiente("IDENTIFICAR")).toMatchObject({ modo_id: modo, dispositivo_id: lector });

    const evento = { modo_id: modo, evento_id: "autorizacion-0001", slot: 2 };
    await cliente.publishAsync("labassist/biometria/asistencia", JSON.stringify({
      operacion: "REGISTRAR_ASISTENCIA", dispositivo_id: lector, huella_id: 2,
    }), { qos: 1 });
    await esperar(100);
    expect((await get("/reservas/me/activa", alumno)).body.data.estado_pc).toBe("Reservada");

    await emitir("IDENTIFICACION", evento, lectorAjeno);
    expect(await siguiente("RESULTADO_ASISTENCIA")).toMatchObject({ codigo: "MODO_NO_VIGENTE" });
    await emitir("IDENTIFICACION", { ...evento, evento_id: "desconocida-0001", slot: 5 });
    expect(await siguiente("RESULTADO_ASISTENCIA")).toMatchObject({ codigo: "HUELLA_NO_REGISTRADA" });
    await emitir("IDENTIFICACION", evento, lector, claves[lectorAjeno]);
    await esperar(100);
    expect((await get("/reservas/me/activa", alumno)).body.data.estado_pc).toBe("Reservada");

    await Promise.all([emitir("IDENTIFICACION", evento), emitir("IDENTIFICACION", evento)]);
    const respuesta = await siguiente("RESULTADO_ASISTENCIA");
    expect(respuesta).toMatchObject({ resultado: "AUTORIZADA", evento_id: evento.evento_id });
    expect(await siguiente("RESULTADO_ASISTENCIA")).toEqual(respuesta);
    const { rows: [fila] } = await db.query(
      "SELECT asistencia_confirmada_en, (SELECT count(*) FROM biometria_identificacion WHERE lector_id = $2 AND evento_id = $3) AS eventos FROM reserva WHERE id = $1",
      [reserva, lector, evento.evento_id]
    );
    expect(fila.asistencia_confirmada_en.toISOString()).toBe(respuesta.asistencia_en);
    expect(fila.eventos).toBe(1);
    expect((await get("/reservas/me/activa", alumno)).body.data.estado_pc).toBe("Ocupada");
    expect((await get("/ocupacion/laboratorios/" + laboratorio)).body.data.estadisticas)
      .toMatchObject({ reservadas: 0, ocupadas: 1, presentes: 1 });
    const final = await post(`/ocupacion/laboratorios/${laboratorio}/sesiones/${sesion}/finalizar`, { desocupado: true });
    expect(final.status).toBe(200);
    await emitir("IDENTIFICACION", { ...evento, evento_id: "sesion-cerrada-01" });
    expect(await siguiente("RESULTADO_ASISTENCIA")).toMatchObject({ resultado: "RECHAZADA", codigo: "MODO_NO_VIGENTE" });
  });

  test("rechaza una reserva vencida aunque el proceso de fondo aún no la haya actualizado", async () => {
    await presente();
    await esperar(80);
    const abierta = await post("/ocupacion/laboratorios/" + laboratorio + "/sesiones");
    const nueva = abierta.body.data.sesion.id;
    const pendiente = (await post("/reservas", { sesionId: nueva, computadoraId: pc }, alumno)).body.data.id;
    const activar = await post("/biometria/identificacion");
    const nuevoModo = activar.body.data.modo_id;
    expect(await siguiente("IDENTIFICAR")).toMatchObject({ modo_id: nuevoModo });
    await db.query("UPDATE reserva SET creada_en = now() - interval '2 seconds', vence_en = now() - interval '1 second' WHERE id=$1", [pendiente]);
    await emitir("IDENTIFICACION", { modo_id: nuevoModo, evento_id: "reserva-vencida-01", slot: 2 });
    expect(await siguiente("RESULTADO_ASISTENCIA")).toMatchObject({ resultado: "RECHAZADA", codigo: "RESERVA_NO_VIGENTE" });
    expect((await get("/reservas/me/activa", alumno)).body.data).toBeNull();
  });
});
