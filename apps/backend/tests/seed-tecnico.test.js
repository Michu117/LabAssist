const bcrypt = require("bcrypt");

const {
  requiereBasePrueba,
  crearPoolPrueba,
  reiniciarEsquema,
} = require("./utilidades/db");
const { ejecutarMigraciones } = require("../src/database/migrate");
const { sembrarTecnico } = require("../src/database/seed-tecnico");

const datosSemilla = {
  nombre: "Tecnico",
  apellido: "Docente",
  cedula: "1100000007",
  correo: "tecnico@unl.edu.ec",
  clave: "Tecnico123",
};

const hayBaseDePruebas = requiereBasePrueba();

(hayBaseDePruebas ? describe : describe.skip)("Semilla del Técnico Docente", () => {
  let pool;

  beforeAll(async () => {
    pool = crearPoolPrueba();
    await reiniciarEsquema(pool);
    await ejecutarMigraciones(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crea el usuario, su cuenta y su fila en tecnico_docente", async () => {
    const resultado = await sembrarTecnico(pool, datosSemilla);

    expect(resultado.creado).toBe(true);

    const usuario = await pool.query("SELECT * FROM usuario WHERE cedula = $1", [
      datosSemilla.cedula,
    ]);
    expect(usuario.rowCount).toBe(1);
    expect(usuario.rows[0].correo).toBe(datosSemilla.correo);

    const tecnico = await pool.query(
      "SELECT * FROM tecnico_docente WHERE usuario_id = $1",
      [usuario.rows[0].id]
    );
    expect(tecnico.rowCount).toBe(1);

    const cuenta = await pool.query(
      "SELECT * FROM cuenta WHERE usuario_id = $1",
      [usuario.rows[0].id]
    );
    expect(cuenta.rowCount).toBe(1);
    expect(cuenta.rows[0].cuenta).toBe(datosSemilla.correo);
  });

  it("guarda la contraseña como hash de bcrypt y no en texto plano", async () => {
    await sembrarTecnico(pool, datosSemilla);

    const { rows } = await pool.query("SELECT clave FROM cuenta");
    const claveGuardada = rows[0].clave;

    expect(claveGuardada).toMatch(/^\$2[aby]\$\d\d\$/);
    expect(claveGuardada).not.toContain(datosSemilla.clave);
    expect(await bcrypt.compare(datosSemilla.clave, claveGuardada)).toBe(true);
  });

  it("no duplica el Técnico Docente si ya existe", async () => {
    await sembrarTecnico(pool, datosSemilla);
    const resultado = await sembrarTecnico(pool, datosSemilla);

    expect(resultado.creado).toBe(false);

    const usuarios = await pool.query("SELECT COUNT(*)::int AS total FROM usuario");
    const cuentas = await pool.query("SELECT COUNT(*)::int AS total FROM cuenta");
    expect(usuarios.rows[0].total).toBe(1);
    expect(cuentas.rows[0].total).toBe(1);
  });

  it("la huella queda en NULL porque está fuera de este avance", async () => {
    await sembrarTecnico(pool, datosSemilla);

    const { rows } = await pool.query("SELECT huella FROM estudiante");
    expect(rows).toEqual([]);
  });
});
