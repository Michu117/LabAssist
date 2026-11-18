// El SQL vive solo en los repositorios.

async function buscarPorCedula(pool, cedula) {
  const { rows } = await pool.query(
    "SELECT id FROM usuario WHERE cedula = $1",
    [cedula]
  );
  return rows[0] || null;
}

async function buscarPorCorreo(pool, correo) {
  const { rows } = await pool.query(
    "SELECT id FROM usuario WHERE correo = $1",
    [correo]
  );
  return rows[0] || null;
}

async function buscarCuentaPorCorreo(pool, correo) {
  const { rows } = await pool.query(
    `SELECT usuario_id, clave
       FROM cuenta
      WHERE cuenta = $1`,
    [correo]
  );
  return rows[0] || null;
}

// El tipo de usuario se deriva de la tabla en la que existe, no de una
// columna rol.
async function buscarUsuarioPorId(pool, id) {
  const { rows } = await pool.query(
    `SELECT u.id,
            u.nombre,
            u.apellido,
            u.cedula,
            u.correo,
            CASE
              WHEN e.usuario_id IS NOT NULL THEN 'ESTUDIANTE'
              WHEN t.usuario_id IS NOT NULL THEN 'TECNICO_DOCENTE'
            END AS tipo
       FROM usuario u
       LEFT JOIN estudiante e ON e.usuario_id = u.id
       LEFT JOIN tecnico_docente t ON t.usuario_id = u.id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Crea al estudiante y sus tablas relacionadas en una sola transacción.
// huella queda en NULL porque está fuera de este avance.
async function crearEstudiante(pool, datos, hashClave) {
  const { nombre, apellido, cedula, correo, carrera, ciclo } = datos;
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
      `INSERT INTO estudiante (usuario_id, carrera, ciclo)
       VALUES ($1, $2, $3)`,
      [usuarioId, carrera, ciclo]
    );
    await cliente.query(
      `INSERT INTO cuenta (usuario_id, cuenta, clave)
       VALUES ($1, $2, $3)`,
      [usuarioId, correo, hashClave]
    );

    await cliente.query("COMMIT");
    return usuarioId;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = {
  buscarPorCedula,
  buscarPorCorreo,
  buscarCuentaPorCorreo,
  buscarUsuarioPorId,
  crearEstudiante,
};
