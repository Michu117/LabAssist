const fs = require("fs");
const path = require("path");

const config = require("../config");
const { crearPool } = require("./pool");

const DIR_MIGRACIONES = path.join(__dirname, "migrations");

// Tabla técnica (no pertenece al dominio UML) que registra las migraciones
// ya aplicadas para no repetirlas en cada arranque.
const SQL_TABLA_MIGRACION = `
  CREATE TABLE IF NOT EXISTS migracion (
    nombre      VARCHAR(255) PRIMARY KEY,
    aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

async function ejecutarMigraciones(pool) {
  await pool.query(SQL_TABLA_MIGRACION);

  const archivos = fs
    .readdirSync(DIR_MIGRACIONES)
    .filter((archivo) => archivo.endsWith(".sql"))
    .sort();

  const aplicadas = [];

  for (const archivo of archivos) {
    const existe = await pool.query(
      "SELECT 1 FROM migracion WHERE nombre = $1",
      [archivo]
    );
    if (existe.rowCount > 0) continue;

    const sql = fs.readFileSync(path.join(DIR_MIGRACIONES, archivo), "utf8");
    const cliente = await pool.connect();

    try {
      await cliente.query("BEGIN");
      await cliente.query(sql);
      await cliente.query("INSERT INTO migracion (nombre) VALUES ($1)", [
        archivo,
      ]);
      await cliente.query("COMMIT");
      aplicadas.push(archivo);
    } catch (error) {
      await cliente.query("ROLLBACK");
      throw error;
    } finally {
      cliente.release();
    }
  }

  return aplicadas;
}

async function main() {
  if (!config.databaseUrl) {
    console.error("Falta la variable de entorno DATABASE_URL");
    process.exit(1);
  }

  const pool = crearPool(config.databaseUrl);

  try {
    const aplicadas = await ejecutarMigraciones(pool);
    if (aplicadas.length > 0) {
      console.log(`Migraciones aplicadas: ${aplicadas.join(", ")}`);
    } else {
      console.log("Base de datos al día, no hay migraciones pendientes.");
    }
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error al ejecutar las migraciones:", error.message);
    process.exit(1);
  });
}

module.exports = { ejecutarMigraciones };
