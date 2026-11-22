const {
  requiereBasePrueba,
  crearPoolPrueba,
  reiniciarEsquema,
} = require("./utilidades/db");
const { ejecutarMigraciones } = require("../src/database/migrate");

const hayBaseDePruebas = requiereBasePrueba();

(hayBaseDePruebas ? describe : describe.skip)("Migraciones", () => {
  let pool;

  beforeAll(async () => {
    pool = crearPoolPrueba();
    await reiniciarEsquema(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crea las cuatro tablas del dominio", async () => {
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);

    const { rows } = await pool.query(
      `SELECT table_name
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name IN ('usuario', 'cuenta', 'estudiante', 'tecnico_docente')`
    );

    expect(rows.map((fila) => fila.table_name).sort()).toEqual([
      "cuenta",
      "estudiante",
      "tecnico_docente",
      "usuario",
    ]);
  });

  it("registra las migraciones aplicadas y no las repite", async () => {
    await reiniciarEsquema(pool);
    const primeraVez = await ejecutarMigraciones(pool);
    const segundaVez = await ejecutarMigraciones(pool);

    expect(primeraVez).toContain("001_esquema_inicial.sql");
    expect(segundaVez).toEqual([]);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS total FROM migracion"
    );
    expect(rows[0].total).toBe(1);
  });

  it("las tablas no tienen columnas fuera del UML", async () => {
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);

    const esperado = {
      usuario: ["id", "nombre", "apellido", "cedula", "correo"],
      cuenta: ["usuario_id", "cuenta", "clave"],
      estudiante: ["usuario_id", "carrera", "ciclo", "huella"],
      tecnico_docente: ["usuario_id"],
    };

    for (const [tabla, columnasEsperadas] of Object.entries(esperado)) {
      const { rows } = await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1`,
        [tabla]
      );
      const columnas = rows.map((fila) => fila.column_name).sort();
      expect(columnas).toEqual([...columnasEsperadas].sort());
    }
  });
});
