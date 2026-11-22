const jwt = require("jsonwebtoken");
const request = require("supertest");

const urlPrueba = process.env.LABORATORIOS_TEST_DATABASE_URL;
if (urlPrueba) {
  const url = new URL(urlPrueba);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.port || url.pathname !== "/labassist_laboratorios_test" || url.search
  ) {
    throw new Error("LABORATORIOS_TEST_DATABASE_URL requiere la base local dedicada labassist_laboratorios_test");
  }
  process.env.DATABASE_URL = urlPrueba;
  process.env.JWT_SECRET = "laboratorios-pruebas-aisladas";
}

const app = require("../src/app");
const { obtenerPool, cerrarPool } = require("../src/database/pool");
const { ejecutarMigraciones } = require("../src/database/migrate");
const base = "/api/v1/laboratorios";

(urlPrueba ? describe : describe.skip)("Gestión de Laboratorios", () => {
  let pool;
  let tecnico;
  let estudiante;
  let cambioObligatorio;
  const datos = { codigo: "LAB-01", nombre: "Laboratorio", cantidad_computadoras: 1 };

  async function crearActor(numero, esTecnico, cambiarClave = false) {
    const correo = `laboratorios-${numero}@example.test`;
    const { rows: [usuario] } = await pool.query(
      "INSERT INTO usuario (nombre, apellido, cedula, correo) VALUES ('Prueba', 'Laboratorios', $1, $2) RETURNING id",
      [String(numero).padStart(10, "0"), correo]
    );
    await pool.query(
      "INSERT INTO cuenta (usuario_id, cuenta, clave, debe_cambiar_contrasena) VALUES ($1, $2, 'fixture', $3)",
      [usuario.id, correo, cambiarClave]
    );
    await pool.query(esTecnico
      ? "INSERT INTO tecnico_docente (usuario_id) VALUES ($1)"
      : "INSERT INTO estudiante (usuario_id, carrera, ciclo) VALUES ($1, 'Prueba', '1')", [usuario.id]);
    return usuario.id;
  }

  function autorizar(solicitud, actor) {
    return solicitud.auth(jwt.sign({ sub: String(actor) }, process.env.JWT_SECRET), { type: "bearer" });
  }

  function crear(cuerpo, actor = tecnico) {
    return autorizar(request(app).post(base), actor).send(cuerpo);
  }

  function get(ruta = base, actor = tecnico) {
    return autorizar(request(app).get(ruta), actor);
  }

  beforeAll(async () => {
    pool = obtenerPool();
    const { rows: [entorno] } = await pool.query(
      `SELECT current_database() AS nombre, NOT EXISTS (
        SELECT 1 FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ) AS vacia`
    );
    if (entorno.nombre !== "labassist_laboratorios_test" || !entorno.vacia) {
      throw new Error("Gestión de Laboratorios requiere una base dedicada y vacía");
    }
    await ejecutarMigraciones(pool);
    tecnico = await crearActor(1, true);
    estudiante = await crearActor(2, false);
    cambioObligatorio = await crearActor(3, true, true);
  });

  afterAll(cerrarPool);

  it("restringe las tres operaciones a técnicos autenticados con acceso habilitado", async () => {
    const detalle = `${base}/1/computadoras`;
    expect((await request(app).get(base)).status).toBe(401);
    expect((await request(app).get(detalle)).status).toBe(401);
    expect((await request(app).post(base).send(datos)).status).toBe(401);
    for (const actor of [estudiante, cambioObligatorio]) {
      expect((await get(base, actor)).status).toBe(403);
      expect((await get(detalle, actor)).status).toBe(403);
      expect((await crear(datos, actor)).status).toBe(403);
    }
  });

  it("valida campos obligatorios, formato de código, cantidad e identificador", async () => {
    for (const invalido of [
      { codigo: "  " }, { codigo: "LAB 01" }, { codigo: "A".repeat(31) }, { nombre: "  " },
      { cantidad_computadoras: 0 }, { cantidad_computadoras: 1000 }, { cantidad_computadoras: 1.5 },
      { cantidad_computadoras: "2" }, { cantidad_computadoras: null },
    ]) {
      expect((await crear({ ...datos, ...invalido })).status).toBe(400);
    }
    expect((await crear({})).status).toBe(400);
    expect((await get(`${base}/0/computadoras`)).status).toBe(400);
    expect((await get(`${base}/999999/computadoras`)).status).toBe(404);
  });

  it("genera 999 PCs, las ordena numéricamente y devuelve el conteo real sin crear ocupaciones", async () => {
    const alta = await crear({ codigo: " lab-99 ", nombre: " Laboratorio completo ", cantidad_computadoras: 999 });
    expect(alta.status).toBe(201);
    const { laboratorio } = alta.body.data;
    expect(laboratorio).toMatchObject({ codigo: "LAB-99", nombre: "Laboratorio completo", cantidad_computadoras: 999 });
    const consulta = await get(`${base}/${laboratorio.id}/computadoras`);
    expect(consulta.status).toBe(200);
    const { computadoras } = consulta.body.data;
    expect(computadoras.map((pc) => pc.codigo_pc)).toEqual(
      Array.from({ length: 999 }, (_, indice) => `PC-${String(indice + 1).padStart(2, "0")}`)
    );
    expect(new Set(computadoras.map((pc) => pc.id)).size).toBe(999);
    expect(computadoras.every((pc) => pc.estado_fisico === "NORMAL")).toBe(true);
    const { rows: [conteos] } = await pool.query(
      `SELECT
         (SELECT count(*)::int FROM computadora WHERE laboratorio_id = $1 AND (fila IS NOT NULL OR columna IS NOT NULL)) AS ubicadas,
         (SELECT count(*)::int FROM reserva WHERE laboratorio_id = $1) AS reservas,
         (SELECT count(*)::int FROM sesion_practica WHERE laboratorio_id = $1) AS sesiones`,
      [laboratorio.id]
    );
    expect(conteos).toEqual({ ubicadas: 0, reservas: 0, sesiones: 0 });
    const listado = await get();
    expect(listado.body.data.laboratorios).toContainEqual(laboratorio);
    const ocupacion = await get(`/api/v1/ocupacion/laboratorios/${laboratorio.id}`);
    expect(ocupacion.status).toBe(200);
    expect(ocupacion.body.data.estadisticas).toMatchObject({ total: 999, disponibles: 999, presentes: null });
  });

  it("admite un mismo código de PC en laboratorios diferentes y un solo código de laboratorio concurrente", async () => {
    const respuestas = await Promise.all([
      crear({ ...datos, codigo: "concurrente" }), crear({ ...datos, codigo: " CONCURRENTE " }),
    ]);
    expect(respuestas.map(({ status }) => status).sort()).toEqual([201, 409]);
    expect(respuestas.find(({ status }) => status === 409).body.error.codigo).toBe("CODIGO_DUPLICADO");
    const otro = await crear({ ...datos, codigo: "OTRO" });
    expect(otro.status).toBe(201);
    const { rows } = await pool.query(
      `SELECT c.id, c.codigo_pc FROM computadora c JOIN laboratorio l ON l.id = c.laboratorio_id
        WHERE l.codigo IN ('CONCURRENTE', 'OTRO')`
    );
    expect(rows.map((pc) => pc.codigo_pc)).toEqual(["PC-01", "PC-01"]);
    expect(new Set(rows.map((pc) => pc.id)).size).toBe(2);
    expect((await crear({ ...datos, codigo: "otro" })).status).toBe(409);
  });

  it("revierte todo el alta si PostgreSQL omite una de las computadoras", async () => {
    await pool.query(`
      CREATE FUNCTION omitir_pc_de_prueba() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.codigo_pc = 'PC-02' AND EXISTS (
          SELECT 1 FROM laboratorio WHERE id = NEW.laboratorio_id AND codigo = 'ROLLBACK'
        ) THEN
          RETURN NULL;
        END IF;
        RETURN NEW;
      END;
      $$;
      CREATE TRIGGER omitir_pc_de_prueba BEFORE INSERT ON computadora
        FOR EACH ROW EXECUTE FUNCTION omitir_pc_de_prueba();
    `);
    const total = async () => (await pool.query("SELECT count(*)::int AS n FROM computadora")).rows[0].n;
    const antes = await total();
    const resultado = await crear({ ...datos, codigo: "ROLLBACK", cantidad_computadoras: 3 });
    expect(resultado.status).toBe(500);
    expect(resultado.body.error.codigo).toBe("INVENTARIO_INCOMPLETO");
    expect((await pool.query("SELECT 1 FROM laboratorio WHERE codigo = 'ROLLBACK'")).rowCount).toBe(0);
    expect(await total()).toBe(antes);
  });
});
