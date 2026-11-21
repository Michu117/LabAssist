async function lector(db, id) {
  const { rows: [fila] } = await db.query(
    "SELECT * FROM biometria_lector WHERE id = $1 AND habilitado FOR UPDATE", [id]
  );
  return fila;
}

async function crearCaptura(db, id, dispositivo, actor, ocupados) {
  const { rows: [fila] } = await db.query(
    `INSERT INTO biometria_captura (id, dispositivo_id, creada_por, slot)
     SELECT $1, $2::varchar, $3, candidato
       FROM generate_series(1, $4::integer) AS candidato
      WHERE candidato <> ALL($5::integer[])
        AND NOT EXISTS (SELECT 1 FROM biometria_captura WHERE dispositivo_id = $2 AND slot = candidato)
        AND NOT EXISTS (SELECT 1 FROM huella_estudiante WHERE dispositivo_id = $2 AND slot = candidato)
      ORDER BY candidato LIMIT 1
     RETURNING id AS captura_id, estado, dispositivo_id, slot, expira_en`,
    [id, dispositivo.id, actor, dispositivo.capacidad, ocupados]
  );
  return fila;
}

async function obtenerEstado(db, id, actor) {
  const { rows: [fila] } = await db.query(
    `SELECT id, CASE WHEN estado IN ('PENDIENTE', 'COMPLETADA') AND expira_en <= statement_timestamp()
                     THEN 'EXPIRADA' ELSE estado END AS estado,
            dispositivo_id, slot, creada_en, completada_en, expira_en, error_mensaje
       FROM biometria_captura WHERE id = $1 AND creada_por = $2`,
    [id, actor]
  );
  return fila;
}

async function resolverCaptura(db, { captura_id, dispositivo_id, slot, plantilla, mensaje }) {
  await db.query(
    `UPDATE biometria_captura
        SET estado = CASE WHEN $4::text IS NULL THEN 'ERROR' ELSE 'COMPLETADA' END,
            plantilla = $4, error_mensaje = $5, completada_en = statement_timestamp()
      WHERE id = $1 AND dispositivo_id = $2 AND slot = $3 AND estado = 'PENDIENTE'
        AND expira_en > statement_timestamp()`,
    [captura_id, dispositivo_id, slot, plantilla ?? null, mensaje ?? null]
  );
}

async function comprobarResultado(db, evento, mensaje) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM biometria_captura
      WHERE id = $1 AND dispositivo_id = $2 AND slot = $3
        AND ((estado IN ('COMPLETADA', 'USADA') AND plantilla = $4)
          OR (estado = 'ERROR' AND error_mensaje = $5))`,
    [evento.captura_id, evento.dispositivo_id, evento.slot, evento.plantilla ?? null, mensaje ?? null]
  );
  return rowCount === 1;
}

async function crearModo(db, id, dispositivo) {
  const { rows: [fila] } = await db.query(
    `INSERT INTO biometria_modo (id, lector_id, sesion_id, vence_en)
     SELECT $1, $2, s.id, s.inicio + interval '15 minutes'
       FROM sesion_practica s JOIN laboratorio l ON l.id = s.laboratorio_id
      WHERE l.id = $3 AND l.habilitado AND s.estado = 'ABIERTA'
        AND s.inicio + interval '15 minutes' > statement_timestamp()
     ON CONFLICT (lector_id) DO UPDATE SET id = EXCLUDED.id, sesion_id = EXCLUDED.sesion_id,
                                          vence_en = EXCLUDED.vence_en
     RETURNING id AS modo_id, vence_en`,
    [id, dispositivo.id, dispositivo.laboratorio_id]
  );
  return fila;
}

async function buscarReserva(db, dispositivo, evento) {
  const { rows: [fila] } = await db.query(
    `SELECT h.usuario_id AS estudiante_id, s.id AS sesion_id, r.id AS reserva_id
       FROM biometria_modo m
       JOIN sesion_practica s ON s.id = m.sesion_id AND s.laboratorio_id = $2
       JOIN laboratorio l ON l.id = s.laboratorio_id
       LEFT JOIN huella_estudiante h ON h.dispositivo_id = m.lector_id AND h.slot = $3
       LEFT JOIN reserva r ON r.sesion_id = s.id AND r.estudiante_id = h.usuario_id
                          AND r.laboratorio_id = l.id
      WHERE m.id = $4 AND m.lector_id = $1 AND m.vence_en > statement_timestamp()
        AND l.habilitado AND s.estado = 'ABIERTA'
      ORDER BY r.id DESC LIMIT 1`,
    [dispositivo.id, dispositivo.laboratorio_id, evento.slot, evento.modo_id]
  );
  return fila;
}

async function obtenerRespuesta(db, id, eventoId) {
  const { rows: [fila] } = await db.query(
    "SELECT modo_id, slot, respuesta FROM biometria_identificacion WHERE lector_id = $1 AND evento_id = $2",
    [id, eventoId]
  );
  return fila;
}

async function guardarRespuesta(db, id, evento, respuesta) {
  await db.query(
    `INSERT INTO biometria_identificacion (lector_id, evento_id, modo_id, slot, respuesta)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, evento.evento_id, evento.modo_id, evento.slot, respuesta]
  );
}

module.exports = {
  lector, crearCaptura, obtenerEstado, resolverCaptura, comprobarResultado,
  crearModo, buscarReserva, obtenerRespuesta, guardarRespuesta,
};
