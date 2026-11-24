async function crearCaptura(pool, datos) {
  const { id, dispositivoId, creadaPor } = datos;
  await pool.query(
    `INSERT INTO biometria_captura (id, dispositivo_id, creada_por)
     VALUES ($1, $2, $3)`,
    [id, dispositivoId, creadaPor]
  );
}

async function obtenerEstado(pool, id) {
  const { rows } = await pool.query(
    `SELECT id, estado, dispositivo_id, creada_en, completada_en, expira_en,
            error_mensaje
       FROM biometria_captura
      WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

async function completarCaptura(pool, datos) {
  const { id, plantilla, dispositivoId } = datos;
  const { rows } = await pool.query(
    `UPDATE biometria_captura
        SET estado = 'COMPLETADA',
            plantilla = $3,
            dispositivo_id = $2,
            completada_en = NOW()
      WHERE id = $1
        AND dispositivo_id = $2
        AND estado = 'PENDIENTE'
        AND expira_en > NOW()
      RETURNING id, estado, dispositivo_id, completada_en`,
    [id, dispositivoId, plantilla]
  );
  return rows[0] || null;
}

async function consumirCaptura(cliente, datos) {
  const { id } = datos;
  const { rows } = await cliente.query(
    `SELECT plantilla, dispositivo_id
       FROM biometria_captura
      WHERE id = $1
        AND estado = 'COMPLETADA'
        AND expira_en > NOW()
      FOR UPDATE`,
    [id]
  );
  return rows[0] || null;
}

async function marcarCapturaError(pool, datos) {
  const { id, dispositivoId, mensaje } = datos;
  const { rows } = await pool.query(
    `UPDATE biometria_captura
        SET estado = 'ERROR', error_mensaje = $3
      WHERE id = $1 AND dispositivo_id = $2 AND estado = 'PENDIENTE'
      RETURNING id, estado, error_mensaje`,
    [id, dispositivoId, mensaje]
  );
  return rows[0] || null;
}

async function marcarCapturaUsada(cliente, id) {
  await cliente.query(
    `UPDATE biometria_captura SET estado = 'USADA' WHERE id = $1`,
    [id]
  );
}

module.exports = {
  crearCaptura,
  obtenerEstado,
  completarCaptura,
  marcarCapturaError,
  consumirCaptura,
  marcarCapturaUsada,
};
