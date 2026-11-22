const { VIGENTE } = require("../reservas/reservas.repository");

async function bloquearLaboratorio(db, id) {
  const { rows } = await db.query("SELECT id FROM laboratorio WHERE id = $1 FOR UPDATE", [id]);
  return rows[0];
}

async function cambiarHabilitacion(db, id, habilitado) {
  const { rowCount } = await db.query(
    "UPDATE laboratorio SET habilitado = $2 WHERE id = $1 AND habilitado IS DISTINCT FROM $2 RETURNING id",
    [id, habilitado]
  );
  if (rowCount > 0) return true;
  const { rows: [laboratorio] } = await db.query("SELECT habilitado FROM laboratorio WHERE id = $1", [id]);
  return laboratorio?.habilitado === habilitado;
}

async function revisarApertura(db, laboratorioId) {
  const { rows: [estado] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM computadora WHERE laboratorio_id = $1 AND estado_fisico = 'NORMAL') AS operativa,
            EXISTS (SELECT 1 FROM sesion_practica WHERE laboratorio_id = $1 AND estado = 'ABIERTA') AS abierta,
            EXISTS (SELECT 1 FROM reserva r JOIN sesion_practica s ON s.id = r.sesion_id
                     WHERE r.laboratorio_id = $1 AND s.estado IS NULL AND ${VIGENTE}) AS actividad_anterior`,
    [laboratorioId]
  );
  return estado;
}

async function abrir(db, laboratorioId, actor) {
  const { rows: [sesion] } = await db.query(
    `INSERT INTO sesion_practica (laboratorio_id, inicio, estado, abierta_por_id, abierta_por_nombre)
     VALUES ($1, clock_timestamp(), 'ABIERTA', $2, $3) RETURNING *`,
    [laboratorioId, actor.id, actor.nombre]
  );
  return sesion;
}

async function bloquearSesion(db, laboratorioId, sesionId) {
  const { rows } = await db.query(
    "SELECT id, estado FROM sesion_practica WHERE laboratorio_id = $1 AND id = $2 AND estado IS NOT NULL FOR UPDATE",
    [laboratorioId, sesionId]
  );
  return rows[0];
}

async function tieneOcupaciones(db, sesionId) {
  const { rows: [resultado] } = await db.query(
    `SELECT EXISTS (SELECT 1 FROM reserva r WHERE r.sesion_id = $1
                     AND r.asistencia_confirmada_en IS NOT NULL AND ${VIGENTE}) AS ocupada`,
    [sesionId]
  );
  return resultado.ocupada;
}

async function finalizar(db, sesionId, actor) {
  const { rows: [sesion] } = await db.query(
    `WITH cerrada AS (
       UPDATE sesion_practica
          SET estado = 'FINALIZADA', fin = greatest(clock_timestamp(), inicio + interval '1 microsecond'),
              finalizada_por_id = $2, finalizada_por_nombre = $3
        WHERE id = $1 AND estado = 'ABIERTA' RETURNING *
     ), liberadas AS (
       UPDATE reserva r
          SET expirada_en = CASE WHEN r.asistencia_confirmada_en IS NULL AND r.vence_en <= s.fin THEN s.fin END,
              cancelada_por_cierre_en = CASE WHEN r.asistencia_confirmada_en IS NULL AND r.vence_en > s.fin THEN s.fin END,
              ocupacion_finalizada_en = CASE WHEN r.asistencia_confirmada_en IS NOT NULL THEN s.fin END
         FROM cerrada s
        WHERE r.sesion_id = s.id AND r.expirada_en IS NULL
          AND r.cancelada_por_cierre_en IS NULL AND r.ocupacion_finalizada_en IS NULL
     ) SELECT * FROM cerrada`,
    [sesionId, actor.id, actor.nombre]
  );
  return sesion;
}

module.exports = { bloquearLaboratorio, cambiarHabilitacion, revisarApertura, abrir, bloquearSesion, tieneOcupaciones, finalizar };
