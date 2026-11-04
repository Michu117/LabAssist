// El SQL vive solo en los repositorios.

async function buscarPorId(pool, id) {
  const { rows } = await pool.query(
    `SELECT u.id,
            u.nombre,
            u.apellido,
            u.cedula,
            u.correo,
            CASE
              WHEN e.usuario_id IS NOT NULL THEN 'ESTUDIANTE'
              ELSE 'TECNICO_DOCENTE'
            END AS tipo,
            e.carrera,
            e.ciclo
       FROM usuario u
       LEFT JOIN estudiante e ON e.usuario_id = u.id
      WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function buscarCuentaPorUsuario(pool, id) {
  const { rows } = await pool.query(
    "SELECT clave FROM cuenta WHERE usuario_id = $1",
    [id]
  );
  return rows[0] || null;
}

// Actualiza los datos del usuario y, si es estudiante, su carrera y ciclo.
async function actualizarPerfil(pool, id, datos) {
  const { nombre, apellido, carrera, ciclo } = datos;
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    await cliente.query(
      "UPDATE usuario SET nombre = $1, apellido = $2 WHERE id = $3",
      [nombre, apellido, id]
    );
    if (carrera !== undefined) {
      await cliente.query(
        "UPDATE estudiante SET carrera = $1, ciclo = $2 WHERE usuario_id = $3",
        [carrera, ciclo, id]
      );
    }
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

async function actualizarClave(pool, id, hashClave) {
  await pool.query("UPDATE cuenta SET clave = $1 WHERE usuario_id = $2", [
    hashClave,
    id,
  ]);
}

async function listar(pool, { limite, offset, tipo, busqueda }) {
  const { rows } = await pool.query(
    `SELECT u.id,
            u.nombre,
            u.apellido,
            u.cedula,
            u.correo,
            CASE
              WHEN e.usuario_id IS NOT NULL THEN 'ESTUDIANTE'
              ELSE 'TECNICO_DOCENTE'
            END AS tipo,
            e.carrera,
            e.ciclo,
            COUNT(*) OVER()::int AS total
       FROM usuario u
       LEFT JOIN estudiante e ON e.usuario_id = u.id
       LEFT JOIN tecnico_docente t ON t.usuario_id = u.id
      WHERE ($1::text IS NULL
             OR ($1 = 'ESTUDIANTE' AND e.usuario_id IS NOT NULL)
             OR ($1 = 'TECNICO_DOCENTE' AND t.usuario_id IS NOT NULL))
        AND ($2::text IS NULL
             OR u.nombre ILIKE '%' || $2 || '%'
             OR u.apellido ILIKE '%' || $2 || '%'
             OR u.cedula LIKE '%' || $2 || '%'
             OR u.correo ILIKE '%' || $2 || '%')
      ORDER BY u.apellido, u.nombre, u.id
      LIMIT $3 OFFSET $4`,
    [tipo ?? null, busqueda ?? null, limite, offset]
  );
  return rows;
}

// Crea un Técnico Docente con su cuenta en una sola transacción.
async function crearTecnico(pool, datos, hashClave) {
  const { nombre, apellido, cedula, correo } = datos;
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

// Actualiza usuario, estudiante y la cuenta de acceso (cuenta.cuenta) en una
// sola transacción, para que el correo quede sincronizado.
async function actualizarUsuario(pool, id, datos) {
  const { nombre, apellido, cedula, correo, carrera, ciclo } = datos;
  const cliente = await pool.connect();

  try {
    await cliente.query("BEGIN");
    await cliente.query(
      "UPDATE usuario SET nombre = $1, apellido = $2, cedula = $3, correo = $4 WHERE id = $5",
      [nombre, apellido, cedula, correo, id]
    );
    if (carrera !== undefined) {
      await cliente.query(
        "UPDATE estudiante SET carrera = $1, ciclo = $2 WHERE usuario_id = $3",
        [carrera, ciclo, id]
      );
    }
    await cliente.query("UPDATE cuenta SET cuenta = $1 WHERE usuario_id = $2", [
      correo,
      id,
    ]);
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

async function eliminar(pool, id) {
  await pool.query("DELETE FROM usuario WHERE id = $1", [id]);
}

module.exports = {
  buscarPorId,
  buscarCuentaPorUsuario,
  actualizarPerfil,
  actualizarClave,
  listar,
  crearTecnico,
  actualizarUsuario,
  eliminar,
};
