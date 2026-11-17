const { Pool } = require("pg");

const urlPrueba = process.env.TEST_DATABASE_URL;

// Las pruebas de base de datos usan siempre una base separada. Si el nombre
// no contiene "test" se bloquea la ejecución para no tocar otros datos.
function requiereBasePrueba() {
  if (!urlPrueba) {
    console.warn(
      "TEST_DATABASE_URL no está definida; las pruebas de base de datos se omiten."
    );
    return false;
  }
  if (!/test/i.test(urlPrueba)) {
    throw new Error(
      "TEST_DATABASE_URL debe apuntar a una base de datos cuyo nombre contenga 'test'"
    );
  }
  return true;
}

function crearPoolPrueba() {
  return new Pool({ connectionString: urlPrueba, max: 5 });
}

// Prepara el entorno de las pruebas de API: apunta la aplicación a la base de
// pruebas y define un secreto JWT. Devuelve false si no hay base configurada.
function prepararEntornoPrueba() {
  if (!requiereBasePrueba()) return false;

  process.env.DATABASE_URL = urlPrueba;
  if (!process.env.JWT_SECRET) {
    process.env.JWT_SECRET = "secreto_de_pruebas";
  }
  return true;
}

async function reiniciarEsquema(pool) {
  await pool.query("DROP SCHEMA public CASCADE");
  await pool.query("CREATE SCHEMA public");
}

module.exports = {
  requiereBasePrueba,
  crearPoolPrueba,
  reiniciarEsquema,
  prepararEntornoPrueba,
};
