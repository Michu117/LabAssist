const bcrypt = require("bcrypt");

const config = require("../config");
const { crearPool } = require("./pool");

const COSTO_BCRYPT = 10;

// Crea el primer Técnico Docente. Es idempotente: si la cuenta ya existe,
// no vuelve a insertar nada.
async function sembrarTecnico(pool, datos) {
  const { nombre, apellido, cedula, correo, clave } = datos;

  const existente = await pool.query(
    `SELECT u.id
       FROM usuario u
       LEFT JOIN cuenta c ON c.usuario_id = u.id
      WHERE c.cuenta = $1 OR u.cedula = $2`,
    [correo, cedula]
  );
  if (existente.rowCount > 0) {
    return { creado: false, usuarioId: existente.rows[0].id };
  }

  const hash = await bcrypt.hash(clave, COSTO_BCRYPT);
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    const { rows } = await cliente.query(
      `INSERT INTO usuario (nombre, apellido, cedula, correo)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [nombre, apellido, cedula, correo]
    );
    const usuarioId = rows[0].id;

    await cliente.query(
      "INSERT INTO tecnico_docente (usuario_id) VALUES ($1)",
      [usuarioId]
    );
    await cliente.query(
      "INSERT INTO cuenta (usuario_id, cuenta, clave) VALUES ($1, $2, $3)",
      [usuarioId, correo, hash]
    );

    await cliente.query("COMMIT");
    return { creado: true, usuarioId };
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

function leerDatosDeEntorno() {
  const datos = {
    nombre: process.env.SEED_TECNICO_NOMBRE,
    apellido: process.env.SEED_TECNICO_APELLIDO,
    cedula: process.env.SEED_TECNICO_CEDULA,
    correo: process.env.SEED_TECNICO_CORREO,
    clave: process.env.SEED_TECNICO_CLAVE,
  };

  const faltantes = Object.entries(datos)
    .filter(([, valor]) => !valor)
    .map(([claveDato]) => `SEED_TECNICO_${claveDato.toUpperCase()}`);

  if (faltantes.length > 0) {
    throw new Error(`Faltan variables de entorno: ${faltantes.join(", ")}`);
  }

  return datos;
}

async function main() {
  if (!config.databaseUrl) {
    console.error("Falta la variable de entorno DATABASE_URL");
    process.exit(1);
  }

  const datos = leerDatosDeEntorno();
  const pool = crearPool(config.databaseUrl);

  try {
    const resultado = await sembrarTecnico(pool, datos);
    if (resultado.creado) {
      console.log(`Técnico Docente creado con id ${resultado.usuarioId}.`);
    } else {
      console.log("El Técnico Docente ya existía, no se creó de nuevo.");
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error al sembrar el Técnico Docente:", error.message);
    process.exit(1);
  });
}

module.exports = { sembrarTecnico };
