const fs = require("node:fs");
const path = require("node:path");
const jwt = require("jsonwebtoken");
const request = require("supertest");

const urlPrueba = process.env.SESIONES_TEST_DATABASE_URL;
if (urlPrueba) {
  const url = new URL(urlPrueba);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1"].includes(url.hostname) || !url.port
    || url.pathname !== "/labassist_sesiones_test" || url.search) {
    throw new Error("SESIONES_TEST_DATABASE_URL exige una base local dedicada labassist_sesiones_test");
  }
  process.env.DATABASE_URL = urlPrueba;
  process.env.JWT_SECRET = "sesiones-pruebas-aisladas";
}

const app = require("../src/app");
const { obtenerPool, cerrarPool } = require("../src/database/pool");
const { ejecutarMigraciones } = require("../src/database/migrate");
const { confirmarAsistenciaVerificada } = require("../src/modules/reservas/reservas.asistencia.service");
const base = "/api/v1";

(urlPrueba ? describe : describe.skip)("Sesiones manuales de laboratorio", () => {
  let pool;
  let tecnico;
  let alumno;
  let otro;
  let historica;

  function auth(peticion, actor) {
    return peticion.auth(jwt.sign({ sub: String(actor) }, process.env.JWT_SECRET), { type: "bearer" });
  }

  async function actor(numero, esTecnico) {
    const correo = `sesiones-${numero}@example.test`;
    const { rows: [{ id }] } = await pool.query(
      "INSERT INTO usuario (nombre, apellido, cedula, correo) VALUES ('Sesiones', 'Prueba', $1, $2) RETURNING id",
      [String(numero).padStart(10, "0"), correo]
    );
    await pool.query("INSERT INTO cuenta (usuario_id, cuenta, clave) VALUES ($1, $2, 'fixture')", [id, correo]);
    await pool.query(esTecnico
      ? "INSERT INTO tecnico_docente VALUES ($1)"
      : "INSERT INTO estudiante (usuario_id, carrera, ciclo) VALUES ($1, 'Prueba', '1')", [id]);
    return id;
  }

  function plano(lab) {
    return auth(request(app).get(`${base}/ocupacion/laboratorios/${lab}`), tecnico);
  }
  function abrir(lab, usuario = tecnico) {
    return auth(request(app).post(`${base}/ocupacion/laboratorios/${lab}/sesiones`), usuario).send({});
  }
  function finalizar(lab, sesion, desocupado = false, usuario = tecnico) {
    return auth(request(app).post(`${base}/ocupacion/laboratorios/${lab}/sesiones/${sesion}/finalizar`), usuario)
      .send({ desocupado });
  }
  function girarReserva(sesionId, computadoraId, usuario = alumno) {
    return auth(request(app).post(`${base}/reservas`), usuario).send({ sesionId, computadoraId });
  }
  async function prepararLaboratorio(codigo, cantidad = 2) {
    const r = await auth(request(app).post(`${base}/laboratorios`), tecnico)
      .send({ codigo, nombre: codigo, cantidad_computadoras: cantidad });
    expect(r.status).toBe(201);
    const lab = r.body.data.laboratorio.id;
    const rPlano = await plano(lab);
    return { lab, pcs: rPlano.body.data.computadoras.map(({ id }) => id) };
  }
  function listarSesiones() {
    return auth(request(app).get(`${base}/reservas/sesiones`), alumno);
  }
  function inventario(sesion) {
    return auth(request(app).get(`${base}/reservas/sesiones/${sesion}/computadoras`), alumno);
  }

  beforeAll(async () => {
    pool = obtenerPool();
    const { rows: [entorno] } = await pool.query(`
      SELECT current_database() AS nombre, NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ) AS vacia`);
    if (entorno.nombre !== "labassist_sesiones_test" || !entorno.vacia) {
      throw new Error("Sesiones requiere una base dedicada y vacía");
    }
    const dir = path.join(__dirname, "../src/database/migrations");
    await pool.query("CREATE TABLE migracion (nombre VARCHAR(255) PRIMARY KEY, aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now())");
    for (const archivo of fs.readdirSync(dir).filter((s) => /^00[1-7].+\.sql$/.test(s)).sort()) {
      await pool.query(fs.readFileSync(path.join(dir, archivo), "utf8"));
      await pool.query("INSERT INTO migracion (nombre) VALUES ($1)", [archivo]);
    }
    tecnico = await actor(1, true);
    alumno = await actor(2, false);
    otro = await actor(3, false);
    const { rows: [{ id: lab }] } = await pool.query("INSERT INTO laboratorio (nombre) VALUES ('Histórico') RETURNING id");
    const { rows: [{ id: pc }] } = await pool.query("INSERT INTO computadora (laboratorio_id, codigo_pc) VALUES ($1, 'PC-01') RETURNING id", [lab]);
    const { rows: [{ id: sesion }] } = await pool.query(
      "INSERT INTO sesion_practica (laboratorio_id, inicio, fin) VALUES ($1, now() - interval '2 hours', now() - interval '1 hour') RETURNING id", [lab]
    );
    await pool.query("INSERT INTO sesion_practica_estudiante VALUES ($1, $2)", [sesion, alumno]);
    const { rows: [{ id: reserva }] } = await pool.query(
      `INSERT INTO reserva (sesion_id, estudiante_id, computadora_id, laboratorio_id, creada_en, vence_en, expirada_en)
       SELECT id, $2, $3, laboratorio_id, inicio, inicio + interval '15 minutes', fin
         FROM sesion_practica WHERE id = $1 RETURNING id`, [sesion, alumno, pc]
    );
    historica = { sesion, reserva };
    expect(await ejecutarMigraciones(pool)).toEqual([
      "008_sesiones_manuales_laboratorio.sql",
      "009_biometria_lectores.sql",
    ]);
  });

  afterAll(cerrarPool);

  it("conserva registros anteriores y exige rol de técnico y PC operativa para activar", async () => {
    expect((await listarSesiones()).body.data.sesiones).toEqual([]);
    expect((await inventario(historica.sesion)).status).toBe(404);
    const { rows: [anterior] } = await pool.query(
      "SELECT s.estado, s.fin, r.expirada_en FROM reserva r JOIN sesion_practica s ON s.id = r.sesion_id WHERE r.id = $1", [historica.reserva]
    );
    expect(anterior.estado).toBeNull();
    expect(anterior.expirada_en).toEqual(anterior.fin);
    const { lab } = await prepararLaboratorio("CONTROLES");
    expect((await request(app).post(`${base}/ocupacion/laboratorios/${lab}/sesiones`).send({})).status).toBe(401);
    expect((await abrir(lab, alumno)).status).toBe(403);
    expect((await plano(lab)).body.data.laboratorio.habilitado).toBe(false);
    await pool.query("UPDATE computadora SET estado_fisico = 'DAÑADA' WHERE laboratorio_id = $1", [lab]);
    expect((await abrir(lab)).body.error.codigo).toBe("SIN_PC_OPERATIVA");
    expect((await plano(lab)).body.data).toMatchObject({ laboratorio: { habilitado: false }, sesion: null });
  });

  it("serializa aperturas y cierre, cancela pendientes y permite reservar tras una nueva apertura", async () => {
    const { lab, pcs } = await prepararLaboratorio("MANUAL");
    const intentos = await Promise.all([abrir(lab), abrir(lab)]);
    expect(intentos.map((r) => r.status).sort()).toEqual([201, 409]);
    const { sesion } = intentos.find((r) => r.status === 201).body.data;
    expect(sesion).toMatchObject({ estado: "ABIERTA", fin: null, abierta_por_id: tecnico });
    expect((await plano(lab)).body.data.laboratorio.habilitado).toBe(true);
    expect((await listarSesiones()).body.data.sesiones).toContainEqual(expect.objectContaining({
      id: sesion.id, admite_reservas: true, cantidad_disponibles: 2,
    }));
    expect((await finalizar(lab, sesion.id, true, alumno)).status).toBe(403);
    const alta = await girarReserva(sesion.id, pcs[0]);
    expect(alta.status).toBe(201);
    expect(Date.parse(alta.body.data.vence_en) - Date.parse(sesion.inicio)).toBe(900_000);
    expect((await plano(lab)).body.data.estadisticas.reservadas).toBe(1);
    const cierres = await Promise.all([finalizar(lab, sesion.id), finalizar(lab, sesion.id)]);
    expect(cierres.map((r) => r.status).sort()).toEqual([200, 409]);
    const cerrada = cierres.find((r) => r.status === 200).body.data.sesion;
    expect(cerrada).toMatchObject({ estado: "FINALIZADA", finalizada_por_id: tecnico });
    const { rows: [pendiente] } = await pool.query(
      "SELECT cancelada_por_cierre_en, expirada_en FROM reserva WHERE id = $1", [alta.body.data.id]
    );
    expect(pendiente.cancelada_por_cierre_en.toISOString()).toEqual(cerrada.fin);
    expect(pendiente.expirada_en).toBeNull();
    expect((await inventario(sesion.id)).status).toBe(404);
    expect((await girarReserva(sesion.id, pcs[1])).status).toBe(404);
    expect((await listarSesiones()).body.data.sesiones).toEqual([]);
    expect((await plano(lab)).body.data.estadisticas.disponibles).toBe(2);
    expect((await plano(lab)).body.data.laboratorio.habilitado).toBe(false);
    const nueva = (await abrir(lab)).body.data.sesion;
    expect((await girarReserva(nueva.id, pcs[0])).status).toBe(201);
    expect((await finalizar(lab, nueva.id)).status).toBe(200);
  });

  it("cierra la ventana de quince minutos y conserva una ocupación confirmada hasta el cierre", async () => {
    const { lab, pcs } = await prepararLaboratorio("VENTANA", 3);
    const { sesion } = (await abrir(lab)).body.data;
    const primera = (await girarReserva(sesion.id, pcs[0])).body.data;
    const segunda = (await girarReserva(sesion.id, pcs[1], otro)).body.data;
    // Solo ejercita el contrato interno con identidad de prueba, sin sensor ni MQTT.
    const identidad = { estudianteId: alumno, sesionId: sesion.id, reservaId: primera.id };
    await expect(confirmarAsistenciaVerificada({ ...identidad, estudianteId: otro })).rejects.toMatchObject({ codigo: "RESERVA_NO_ENCONTRADA" });
    const confirmada = await confirmarAsistenciaVerificada(identidad);
    expect(await confirmarAsistenciaVerificada(identidad)).toEqual(confirmada);
    await pool.query("UPDATE sesion_practica SET inicio = now() - interval '15 minutes' WHERE id = $1", [sesion.id]);
    await pool.query("UPDATE reserva SET creada_en = now() - interval '16 minutes', vence_en = now() WHERE id = $1", [segunda.id]);
    expect((await listarSesiones()).body.data.sesiones).toContainEqual(expect.objectContaining({
      id: sesion.id, admite_reservas: false,
    }));
    const equipos = (await inventario(sesion.id)).body.data.inventario;
    expect(equipos.map(({ estado }) => estado)).toEqual(["Ocupada", "Disponible", "Disponible"]);
    expect((await girarReserva(sesion.id, pcs[2], otro)).body.error.codigo).toBe("SESION_CERRADA");
    await expect(confirmarAsistenciaVerificada({ estudianteId: otro, sesionId: sesion.id, reservaId: segunda.id }))
      .rejects.toMatchObject({ codigo: "RESERVA_NO_VIGENTE" });
    expect((await finalizar(lab, sesion.id)).body.error.codigo).toBe("CONFIRMAR_LABORATORIO_DESOCUPADO");
    await pool.query("UPDATE computadora SET estado_fisico = 'DAÑADA' WHERE id = $1", [pcs[0]]);
    expect((await finalizar(lab, sesion.id, true)).status).toBe(200);
    expect((await plano(lab)).body.data.estadisticas).toMatchObject({ disponibles: 2, ocupadas: 0, inactivas: 1 });
    const { rows } = await pool.query(
      "SELECT asistencia_confirmada_en, ocupacion_finalizada_en, expirada_en FROM reserva WHERE id IN ($1,$2) ORDER BY id",
      [primera.id, segunda.id]
    );
    expect(rows[0]).toMatchObject({ asistencia_confirmada_en: confirmada.asistencia_confirmada_en, expirada_en: null });
    expect(rows[0].ocupacion_finalizada_en).toBeInstanceOf(Date);
    expect(rows[1].expirada_en).toBeInstanceOf(Date);
    await expect(confirmarAsistenciaVerificada(identidad)).rejects.toMatchObject({ codigo: "SESION_CERRADA" });
  });

  it("no deja una reserva vigente cuando reservar y finalizar se ejecutan simultáneamente", async () => {
    const { lab, pcs } = await prepararLaboratorio("CARRERA");
    const { sesion } = (await abrir(lab)).body.data;
    const [reserva, cierre] = await Promise.all([girarReserva(sesion.id, pcs[0]), finalizar(lab, sesion.id)]);
    expect(cierre.status).toBe(200);
    expect([201, 404]).toContain(reserva.status);
    if (reserva.status === 201) {
      const { rows: [historial] } = await pool.query(
        "SELECT cancelada_por_cierre_en FROM reserva WHERE id = $1", [reserva.body.data.id]
      );
      expect(historial.cancelada_por_cierre_en).toBeInstanceOf(Date);
    }
    expect((await plano(lab)).body.data.estadisticas).toMatchObject({ reservadas: 0, disponibles: 2 });
    expect((await girarReserva(sesion.id, pcs[1])).status).toBe(404);
  });

  it("activa dos laboratorios de forma independiente y solo retira el que se desactiva", async () => {
    const primero = await prepararLaboratorio("INDEPENDIENTE-A");
    const segundo = await prepararLaboratorio("INDEPENDIENTE-B");
    const respuestas = await Promise.all([abrir(primero.lab), abrir(segundo.lab)]);
    expect(respuestas.map(({ status }) => status)).toEqual([201, 201]);
    const [a, b] = respuestas.map(({ body }) => body.data.sesion.id);
    expect((await listarSesiones()).body.data.sesiones.map(({ id }) => id).sort()).toEqual([a, b].sort());
    expect((await finalizar(primero.lab, a)).status).toBe(200);
    expect((await inventario(a)).status).toBe(404);
    expect((await inventario(b)).status).toBe(200);
    expect((await listarSesiones()).body.data.sesiones.map(({ id }) => id)).toEqual([b]);
    expect((await plano(segundo.lab)).body.data.laboratorio.habilitado).toBe(true);
    expect((await finalizar(segundo.lab, b)).status).toBe(200);
  });

  it("revierte la habilitación y conserva el historial cuando falla la escritura de la sesión", async () => {
    const apertura = await prepararLaboratorio("FALLO-ABRIR");
    const cierre = await prepararLaboratorio("FALLO-CERRAR");
    const { sesion } = (await abrir(cierre.lab)).body.data;
    const reserva = await girarReserva(sesion.id, cierre.pcs[0]);
    expect(reserva.status).toBe(201);
    await pool.query(`
      CREATE FUNCTION omitir_cambio_de_sesion() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (TG_OP = 'INSERT' AND EXISTS (
          SELECT 1 FROM laboratorio WHERE id = NEW.laboratorio_id AND codigo = 'FALLO-ABRIR'
        )) OR (NEW.estado = 'FINALIZADA' AND EXISTS (
          SELECT 1 FROM laboratorio WHERE id = NEW.laboratorio_id AND codigo = 'FALLO-CERRAR'
        )) THEN
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER omitir_cambio_de_sesion BEFORE INSERT OR UPDATE ON sesion_practica
        FOR EACH ROW EXECUTE FUNCTION omitir_cambio_de_sesion();
    `);
    expect((await abrir(apertura.lab)).body.error.codigo).toBe("CAMBIO_SESION_INCOMPLETO");
    expect((await plano(apertura.lab)).body.data).toMatchObject({ laboratorio: { habilitado: false }, sesion: null });
    expect((await finalizar(cierre.lab, sesion.id)).body.error.codigo).toBe("CAMBIO_SESION_INCOMPLETO");
    expect((await plano(cierre.lab)).body.data).toMatchObject({
      laboratorio: { habilitado: true }, sesion: { estado: "ABIERTA" }, estadisticas: { reservadas: 1 },
    });
    const { rows: [historial] } = await pool.query("SELECT cancelada_por_cierre_en FROM reserva WHERE id = $1", [reserva.body.data.id]);
    expect(historial.cancelada_por_cierre_en).toBeNull();
    await pool.query("ALTER TABLE sesion_practica DISABLE TRIGGER omitir_cambio_de_sesion");
    expect((await finalizar(cierre.lab, sesion.id)).status).toBe(200);
  });
});
