const { Pool, types } = require("pg");

const config = require("../config");

// pg devuelve BIGINT como string; los identificadores del sistema se
// representan como número (seguro hasta 2^53).
types.setTypeParser(20, (valor) => Number(valor));

let pool = null;

// Pool compartido de conexiones. Se crea en el primer uso para que poder
// requerir este módulo no falle cuando DATABASE_URL aún no esté definida.
function obtenerPool() {
  if (!pool) {
    if (!config.databaseUrl) {
      throw new Error("Falta la variable de entorno DATABASE_URL");
    }
    pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
  }
  return pool;
}

function crearPool(cadenaConexion) {
  return new Pool({ connectionString: cadenaConexion, max: 10 });
}

// Cierra el pool compartido; lo usan las pruebas para terminar limpiamente.
async function cerrarPool() {
  if (pool) {
    const porCerrar = pool;
    pool = null;
    await porCerrar.end();
  }
}

module.exports = { obtenerPool, crearPool, cerrarPool };
