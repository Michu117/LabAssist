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
             c.debe_cambiar_contrasena,
            CASE
              WHEN e.usuario_id IS NOT NULL THEN 'ESTUDIANTE'
              WHEN t.usuario_id IS NOT NULL THEN 'TECNICO_DOCENTE'
            END AS tipo
       FROM usuario u
       LEFT JOIN cuenta c ON c.usuario_id = u.id
       LEFT JOIN estudiante e ON e.usuario_id = u.id
       LEFT JOIN tecnico_docente t ON t.usuario_id = u.id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

// Crea al estudiante, su cuenta temporal y su huella en una sola transacción.
async function crearEstudiante(pool, datos, hashClave, captura) {
  const { nombre, apellido, cedula, correo, carrera, ciclo } = datos;
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const capturaResult = await cliente.query(
      `SELECT plantilla, dispositivo_id
         FROM biometria_captura
        WHERE id = $1
          AND estado = 'COMPLETADA'
          AND expira_en > NOW()
        FOR UPDATE`,
      [captura.id]
    );
    if (capturaResult.rows.length === 0) {
      const error = new Error("La captura biométrica no es válida o expiró");
      error.codigo = "CAPTURA_INVALIDA";
      throw error;
    }
    const plantilla = capturaResult.rows[0];

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
      `INSERT INTO cuenta (usuario_id, cuenta, clave, debe_cambiar_contrasena)
       VALUES ($1, $2, $3, TRUE)`,
      [usuarioId, correo, hashClave]
    );

    await cliente.query(
      `INSERT INTO huella_estudiante (usuario_id, plantilla, dispositivo_id)
       VALUES ($1, $2, $3)`,
      [usuarioId, plantilla.plantilla, plantilla.dispositivo_id]
    );
    await cliente.query(
      `UPDATE biometria_captura SET estado = 'USADA' WHERE id = $1`,
      [captura.id]
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

async function guardarTokenRecuperacion(pool, usuarioId, tokenHash) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    await cliente.query(
      `DELETE FROM recuperacion_contrasena
       WHERE usuario_id = $1`,
      [usuarioId]
    );

    await cliente.query(
      `INSERT INTO recuperacion_contrasena
       (usuario_id, token_hash, fecha_expiracion)
       VALUES ($1, $2, NOW() + INTERVAL '15 minutes')`,
      [usuarioId, tokenHash]
    );

    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

async function buscarTokenRecuperacion(pool, tokenHash) {
  const { rows } = await pool.query(
    `SELECT usuario_id
     FROM recuperacion_contrasena
     WHERE token_hash = $1
       AND fecha_expiracion > NOW()
       AND fecha_utilizacion IS NULL`,
    [tokenHash]
  );

  return rows[0] || null;
}

async function actualizarContrasenaConToken(pool, tokenHash, hashClave) {
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");

    const { rows } = await cliente.query(
      `UPDATE recuperacion_contrasena
       SET fecha_utilizacion = NOW()
       WHERE token_hash = $1
         AND fecha_expiracion > NOW()
         AND fecha_utilizacion IS NULL
       RETURNING usuario_id`,
      [tokenHash]
    );

    if (rows.length === 0) {
      await cliente.query("ROLLBACK");
      return false;
    }

    const usuarioId = rows[0].usuario_id;

    const resultado = await cliente.query(
      `UPDATE cuenta
       SET clave = $1
       WHERE usuario_id = $2`,
      [hashClave, usuarioId]
    );

    if (resultado.rowCount !== 1) {
      throw new Error("No se encontró la cuenta asociada");
    }

    await cliente.query(
      `DELETE FROM recuperacion_contrasena
       WHERE usuario_id = $1
         AND fecha_utilizacion IS NULL`,
      [usuarioId]
    );

    await cliente.query("COMMIT");
    return true;
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
  guardarTokenRecuperacion,
  buscarTokenRecuperacion,
  actualizarContrasenaConToken,
};
