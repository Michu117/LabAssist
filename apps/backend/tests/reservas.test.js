const jwt = require("jsonwebtoken");
const request = require("supertest");

const urlPrueba = process.env.HU04_TEST_DATABASE_URL;
if (urlPrueba) {
  const url = new URL(urlPrueba);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.port || url.pathname !== "/labassist_hu04_test" || url.search
  ) {
    throw new Error("HU04_TEST_DATABASE_URL requiere una base dedicada local labassist_hu04_test");
  }
  process.env.DATABASE_URL = urlPrueba;
  process.env.JWT_SECRET = "hu04-pruebas-aisladas";
}

const app = require("../src/app");
const { obtenerPool, cerrarPool } = require("../src/database/pool");
const { ejecutarMigraciones } = require("../src/database/migrate");
const { iniciarExpiracionReservas } = require("../src/modules/reservas/reservas.expiracion");
const base = "/api/v1/reservas";

function token(id) {
  return jwt.sign({ sub: String(id) }, process.env.JWT_SECRET);
}

(urlPrueba ? describe : describe.skip)("HU-04 · Reservas", () => {
  let pool;
  let actores;
  let practica;
  let practicaCerrada;
  let laboratorio;
  let pcs;

  async function crearActor(numero, estudiante = true, cambiarClave = false) {
    const correo = `hu04-${numero}@example.test`;
    const { rows: [usuario] } = await pool.query(
      "INSERT INTO usuario (nombre, apellido, cedula, correo) VALUES ('HU04', 'Prueba', $1, $2) RETURNING id",
      [String(numero).padStart(10, "0"), correo]
    );
    await pool.query(
      "INSERT INTO cuenta (usuario_id, cuenta, clave, debe_cambiar_contrasena) VALUES ($1, $2, 'fixture', $3)",
      [usuario.id, correo, cambiarClave]
    );
    if (estudiante) {
      await pool.query("INSERT INTO estudiante (usuario_id, carrera, ciclo) VALUES ($1, 'Prueba', '1')", [usuario.id]);
    } else {
      await pool.query("INSERT INTO tecnico_docente (usuario_id) VALUES ($1)", [usuario.id]);
    }
    return usuario.id;
  }

  function reservar(actor, computadoraId, sesionId = practica) {
    return request(app).post(base).auth(token(actor), { type: "bearer" }).send({ sesionId, computadoraId });
  }

  function activa(actor) {
    return request(app).get(`${base}/me/activa`).auth(token(actor), { type: "bearer" });
  }

  beforeAll(async () => {
    pool = obtenerPool();
    const { rows: [entorno] } = await pool.query(
      `SELECT current_database() AS nombre,
              NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                 WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
              ) AS vacia`
    );
    if (entorno.nombre !== "labassist_hu04_test" || !entorno.vacia) {
      throw new Error("Las pruebas HU-04 requieren una base dedicada y vacía");
    }
    await ejecutarMigraciones(pool);
    actores = {
      uno: await crearActor(1), dos: await crearActor(2), sinAsignar: await crearActor(3),
      tecnico: await crearActor(4, false), debeCambiar: await crearActor(5, true, true),
    };
    async function crearLaboratorio(codigo, nombre, cantidad) {
      const respuesta = await request(app).post("/api/v1/laboratorios")
        .auth(token(actores.tecnico), { type: "bearer" })
        .send({ codigo, nombre, cantidad_computadoras: cantidad });
      expect(respuesta.status).toBe(201);
      return respuesta.body.data.laboratorio.id;
    }
    laboratorio = await crearLaboratorio("HU04-A", "HU04 A", 3);
    const otro = await crearLaboratorio("HU04-B", "HU04 B", 1);
    const apertura = await request(app).post(`/api/v1/ocupacion/laboratorios/${laboratorio}/sesiones`)
      .auth(token(actores.tecnico), { type: "bearer" }).send({});
    expect(apertura.status).toBe(201);
    practica = apertura.body.data.sesion.id;
    const { rows: [historica] } = await pool.query(
      "INSERT INTO sesion_practica (laboratorio_id, inicio, fin) VALUES ($1, now() - interval '1 hour', now()) RETURNING id",
      [laboratorio]
    );
    practicaCerrada = historica.id;
    await pool.query("UPDATE computadora SET estado_fisico = 'DAÑADA' WHERE laboratorio_id = $1 AND codigo_pc = 'PC-03'", [laboratorio]);
    const { rows } = await pool.query(
      "SELECT id FROM computadora WHERE laboratorio_id IN ($1, $2) ORDER BY laboratorio_id, codigo_pc", [laboratorio, otro]
    );
    pcs = rows.map(({ id }) => id);
  });

  afterAll(cerrarPool);

  it("autoriza estudiantes sin asignación previa solo en sesiones manuales abiertas", async () => {
    expect((await request(app).get(`${base}/sesiones`)).status).toBe(401);
    expect((await request(app).get(`${base}/me/activa`).auth("inválido", { type: "bearer" })).status).toBe(401);
    expect((await activa(actores.tecnico)).status).toBe(403);
    expect((await activa(actores.debeCambiar)).status).toBe(403);
    const api = request(app);
    const credencial = token(actores.sinAsignar);
    expect((await api.get(`${base}/sesiones`).auth(credencial, { type: "bearer" })).body.data.sesiones.map(({ id }) => id)).toEqual([practica]);
    expect((await api.get(`${base}/sesiones/${practica}/computadoras`).auth(credencial, { type: "bearer" })).status).toBe(200);
    expect((await reservar(actores.uno, pcs[0], 999999)).status).toBe(404);
    expect((await reservar(actores.uno, pcs[0], 0)).status).toBe(400);
    expect((await reservar(actores.uno, pcs[0], practicaCerrada)).status).toBe(404);
  });

  it("lista las sesiones y PCs elegibles y rechaza una PC dañada o ajena", async () => {
    const api = request(app);
    const credencial = token(actores.uno);
    const sesiones = await api.get(`${base}/sesiones`).auth(credencial, { type: "bearer" });
    expect(sesiones.body.data.sesiones.map(({ id }) => id)).toEqual([practica]);
    expect(sesiones.body.data.sesiones[0]).toMatchObject({
      laboratorio: "HU04 A", laboratorio_codigo: "HU04-A", cantidad_computadoras: 3,
    });
    const inventario = await api.get(`${base}/sesiones/${practica}/computadoras`).auth(credencial, { type: "bearer" });
    expect(inventario.body.data.computadoras).toEqual([
      { id: pcs[0], codigo_pc: "PC-01" }, { id: pcs[1], codigo_pc: "PC-02" },
    ]);
    expect(inventario.body.data.inventario).toEqual([
      { id: pcs[0], codigo_pc: "PC-01", estado: "Disponible" },
      { id: pcs[1], codigo_pc: "PC-02", estado: "Disponible" },
      { id: pcs[2], codigo_pc: "PC-03", estado: "Inactiva" },
    ]);
    expect((await reservar(actores.uno, pcs[2])).body.error.codigo).toBe("PC_NO_DISPONIBLE");
    expect((await reservar(actores.uno, pcs[3])).status).toBe(404);
  });

  it("confirma una sola reserva simultánea y permite reintentar la selección", async () => {
    const participantes = [actores.uno, actores.dos];
    const respuestas = await Promise.all(participantes.map((actor) => reservar(actor, pcs[0])));
    expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
    const ganador = respuestas.findIndex(({ status }) => status === 201);
    const reserva = respuestas[ganador].body.data;
    expect(reserva.estado_pc).toBe("Reservada");
    expect(Date.parse(reserva.vence_en) - Date.parse(reserva.inicio)).toBe(15 * 60_000);
    expect((await activa(participantes[ganador])).body.data).toMatchObject(reserva);
    expect((await activa(participantes[1 - ganador])).body.data).toBeNull();
    const inventario = await request(app).get(`${base}/sesiones/${practica}/computadoras`)
      .auth(token(participantes[1 - ganador]), { type: "bearer" });
    expect(inventario.body.data.computadoras.map(({ id }) => id)).toEqual([pcs[1]]);
    expect(inventario.body.data.inventario[0]).toEqual({ id: pcs[0], codigo_pc: "PC-01", estado: "Reservada" });
    const plano = await request(app).get(`/api/v1/ocupacion/laboratorios/${laboratorio}`)
      .auth(token(actores.tecnico), { type: "bearer" });
    expect(plano.status).toBe(200);
    expect(plano.body.data.computadoras.find(({ id }) => id === pcs[0])).toMatchObject({ estado: "Reservada" });
    expect((await reservar(participantes[ganador], pcs[0])).status).toBe(200);
    expect((await reservar(participantes[ganador], pcs[1])).body.error.codigo).toBe("RESERVA_ACTIVA");
    const intentarInsercionDirecta = (actor, pc) => pool.query(
      `INSERT INTO reserva
         (sesion_id, estudiante_id, computadora_id, laboratorio_id, creada_en, vence_en)
       SELECT id, $2, $3, laboratorio_id, now(), inicio + interval '15 minutes'
         FROM sesion_practica WHERE id = $1`,
      [practica, actor, pc]
    );
    await expect(intentarInsercionDirecta(participantes[1 - ganador], pcs[0]))
      .rejects.toMatchObject({ code: "23505", constraint: "reserva_pc_vigente" });
    await expect(intentarInsercionDirecta(participantes[ganador], pcs[1]))
      .rejects.toMatchObject({ code: "23505", constraint: "reserva_estudiante_vigente" });
    await expect(intentarInsercionDirecta(participantes[1 - ganador], pcs[3]))
      .rejects.toMatchObject({ code: "23503" });
    const { rows: [{ total }] } = await pool.query(
      "SELECT count(*)::int AS total FROM reserva WHERE computadora_id = $1", [pcs[0]]
    );
    expect(total).toBe(1);
  });

  it("oculta una reserva vencida y la libera en segundo plano sin tráfico", async () => {
    const { rows: [seleccion] } = await pool.query("SELECT estudiante_id FROM reserva WHERE computadora_id = $1", [pcs[0]]);
    const libre = seleccion.estudiante_id === actores.uno ? actores.dos : actores.uno;
    const confirmada = await reservar(libre, pcs[1]);
    expect(confirmada.status).toBe(201);
    // Retrocede los tiempos de esta práctica para comprobar el vencimiento sin esperar 15 minutos.
    await pool.query(
      `UPDATE reserva SET creada_en = now() - interval '15 minutes', vence_en = now() WHERE id = $1`,
      [confirmada.body.data.id]
    );
    expect((await activa(libre)).body.data).toBeNull();
    const detener = iniciarExpiracionReservas();
    let expirada;
    try {
      for (let intento = 0; intento < 50; intento++) {
        const { rows: [fila] } = await pool.query("SELECT expirada_en FROM reserva WHERE id = $1", [confirmada.body.data.id]);
        expirada = fila.expirada_en;
        if (expirada) break;
        await new Promise((resolver) => setTimeout(resolver, 20));
      }
    } finally {
      detener();
    }
    expect(expirada).toBeInstanceOf(Date);
    expect((await reservar(libre, pcs[1])).status).toBe(201);
  });
});
