const jwt = require("jsonwebtoken");
const request = require("supertest");

const urlPrueba = process.env.HU05_TEST_DATABASE_URL;
if (urlPrueba) {
  const url = new URL(urlPrueba);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.port || url.pathname !== "/labassist_hu05_test" || url.search
  ) {
    throw new Error("HU05_TEST_DATABASE_URL requiere una base dedicada local labassist_hu05_test");
  }
  process.env.DATABASE_URL = urlPrueba;
  process.env.JWT_SECRET = "hu05-pruebas-aisladas";
}

const app = require("../src/app");
const { obtenerPool, cerrarPool } = require("../src/database/pool");
const { ejecutarMigraciones } = require("../src/database/migrate");
const base = "/api/v1/ocupacion/laboratorios";

(urlPrueba ? describe : describe.skip)("HU-05 · Ocupación", () => {
  let pool;
  let tecnico;
  let estudiante;
  let cambioObligatorio;
  let laboratorio;
  let laboratorioVacio;
  let pcs;

  async function crearActor(numero, tabla, cambiarClave = false) {
    const correo = `hu05-${numero}@example.test`;
    const { rows: [usuario] } = await pool.query(
      "INSERT INTO usuario (nombre, apellido, cedula, correo) VALUES ('HU05', 'Prueba', $1, $2) RETURNING id",
      [String(numero).padStart(10, "0"), correo]
    );
    await pool.query(
      "INSERT INTO cuenta (usuario_id, cuenta, clave, debe_cambiar_contrasena) VALUES ($1, $2, 'fixture', $3)",
      [usuario.id, correo, cambiarClave]
    );
    await pool.query(tabla === "estudiante"
      ? "INSERT INTO estudiante (usuario_id, carrera, ciclo) VALUES ($1, 'Prueba', '1')"
      : "INSERT INTO tecnico_docente (usuario_id) VALUES ($1)", [usuario.id]);
    return usuario.id;
  }

  function get(ruta, actor = tecnico) {
    const token = jwt.sign({ sub: String(actor) }, process.env.JWT_SECRET);
    return request(app).get(ruta).auth(token, { type: "bearer" });
  }

  beforeAll(async () => {
    pool = obtenerPool();
    const { rows: [entorno] } = await pool.query(
      `SELECT current_database() AS nombre, NOT EXISTS (
         SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
       ) AS vacia`
    );
    if (entorno.nombre !== "labassist_hu05_test" || !entorno.vacia) {
      throw new Error("Las pruebas HU-05 requieren una base dedicada y vacía");
    }
    await ejecutarMigraciones(pool);
    tecnico = await crearActor(1, "tecnico");
    estudiante = await crearActor(2, "estudiante");
    cambioObligatorio = await crearActor(3, "tecnico", true);
    const { rows: laboratorios } = await pool.query(
      "INSERT INTO laboratorio (nombre) VALUES ('HU05 A'), ('HU05 B') RETURNING id"
    );
    [laboratorio, laboratorioVacio] = laboratorios.map(({ id }) => id);
    const { rows } = await pool.query(
      `INSERT INTO computadora (laboratorio_id, codigo_pc, estado_fisico, fila, columna) VALUES
        ($1, 'PC-1', 'NORMAL', 1, 1), ($1, 'PC-2', 'NORMAL', NULL, NULL),
        ($1, 'PC-3', 'DAÑADA', 1, 3) RETURNING id`,
      [laboratorio]
    );
    pcs = rows.map(({ id }) => id);
  });

  afterAll(cerrarPool);

  it("protege los tres endpoints y evita cachear el detalle", async () => {
    const rutas = [base, `${base}/${laboratorio}`, `${base}/${laboratorio}/computadoras/${pcs[0]}/ocupante`];
    for (const ruta of rutas) {
      expect((await request(app).get(ruta)).status).toBe(401);
      expect((await get(ruta, estudiante)).status).toBe(403);
      expect((await get(ruta, cambioObligatorio)).status).toBe(403);
    }
    const sinOcupante = await get(rutas[2]);
    expect(sinOcupante.status).toBe(409);
    expect(sinOcupante.headers["cache-control"]).toBe("no-store");
    expect(sinOcupante.body.error.codigo).toBe("PC_SIN_OCUPANTE");
    expect((await get(`${base}/${laboratorioVacio}/computadoras/${pcs[0]}/ocupante`)).status).toBe(404);
  });

  it("lista laboratorios y refleja inventario real, posiciones y ausencia de asistencia", async () => {
    const lista = await get(base);
    expect(lista.body.data.laboratorios.map(({ id }) => id)).toEqual([laboratorio, laboratorioVacio]);
    const respuesta = await get(`${base}/${laboratorio}`);
    expect(respuesta.headers["cache-control"]).toBe("no-store");
    expect(respuesta.body.data).toMatchObject({
      asistencia_integrada: false,
      computadoras: [
        { id: pcs[0], fila: 1, columna: 1, estado: "Disponible" },
        { id: pcs[2], fila: 1, columna: 3, estado: "Inactiva" },
        { id: pcs[1], fila: null, columna: null, estado: "Disponible" },
      ],
      estadisticas: {
        total: 3, disponibles: 2, reservadas: 0, inactivas: 1, ocupadas: 0,
        presentes: null, porcentaje_ocupacion: null,
      },
    });
    expect(Object.keys(respuesta.body.data.computadoras[0]).sort()).toEqual(
      ["codigo_pc", "columna", "estado", "estado_fisico", "fila", "id"]
    );
    const vacio = await get(`${base}/${laboratorioVacio}`);
    expect(vacio.body.data).toMatchObject({ computadoras: [], estadisticas: { total: 0 } });
    expect((await get(`${base}/999999`)).status).toBe(404);
    expect((await get(`${base}/0`)).status).toBe(400);
  });

  it("rechaza posiciones parciales, no positivas o duplicadas en el laboratorio", async () => {
    const insertar = (fila, columna) => pool.query(
      "INSERT INTO computadora (laboratorio_id, codigo_pc, fila, columna) VALUES ($1, 'INVALIDA', $2, $3)",
      [laboratorio, fila, columna]
    );
    await expect(insertar(1, null)).rejects.toMatchObject({ code: "23514" });
    await expect(insertar(0, 2)).rejects.toMatchObject({ code: "23514" });
    await expect(insertar(1, 1)).rejects.toMatchObject({ code: "23505" });
  });

  it("refleja una reserva de HU-04 y su vencimiento entre consultas sucesivas", async () => {
    const apertura = await request(app).post(`${base}/${laboratorio}/sesiones`)
      .auth(jwt.sign({ sub: String(tecnico) }, process.env.JWT_SECRET), { type: "bearer" }).send({});
    expect(apertura.status).toBe(201);
    const { sesion } = apertura.body.data;
    const token = jwt.sign({ sub: String(estudiante) }, process.env.JWT_SECRET);
    const respuesta = await request(app).post("/api/v1/reservas").auth(token, { type: "bearer" })
      .send({ sesionId: sesion.id, computadoraId: pcs[0] });
    expect(respuesta.status).toBe(201);
    const ruta = `${base}/${laboratorio}`;
    const reservada = await get(ruta);
    expect(reservada.body.data.computadoras[0]).toMatchObject({ id: pcs[0], estado: "Reservada" });
    expect(reservada.body.data.estadisticas).toMatchObject({ reservadas: 1, disponibles: 1, presentes: null });
    expect((await get(`${ruta}/computadoras/${pcs[0]}/ocupante`)).status).toBe(409);
    const reservaId = respuesta.body.data.id;
    await pool.query(
      `UPDATE reserva SET creada_en = now() - interval '20 minutes',
        vence_en = now() - interval '1 second' WHERE id = $1`, [reservaId]
    );
    const despues = await get(ruta);
    expect(despues.body.data.computadoras[0]).toMatchObject({ id: pcs[0], estado: "Disponible" });
    expect(despues.body.data.estadisticas).toMatchObject({ reservadas: 0, disponibles: 2 });
    const { rows: [reserva] } = await pool.query("SELECT expirada_en FROM reserva WHERE id = $1", [reservaId]);
    expect(reserva.expirada_en).toBeNull();
  });
});
