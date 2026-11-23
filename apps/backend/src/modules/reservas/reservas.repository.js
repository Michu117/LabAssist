const PLAZO = "s.inicio + INTERVAL '15 minutes'";
const SESION_ABIERTA = "s.estado = 'ABIERTA' AND l.habilitado";
const SIN_CIERRE = "r.expirada_en IS NULL AND r.cancelada_por_cierre_en IS NULL AND r.ocupacion_finalizada_en IS NULL";
const VIGENTE = `${SIN_CIERRE} AND (
  r.asistencia_confirmada_en IS NOT NULL OR r.vence_en > statement_timestamp()
)`;
const ESTADO_PC = `CASE WHEN r.asistencia_confirmada_en IS NOT NULL THEN 'Ocupada'
                        WHEN c.estado_fisico = 'DAÑADA' THEN 'Inactiva'
                        WHEN r.id IS NOT NULL THEN 'Reservada'
                        ELSE 'Disponible' END`;

async function listarSesiones(db) {
  const { rows } = await db.query(
    `SELECT s.id, s.inicio, s.fin, s.estado, l.nombre AS laboratorio, l.codigo AS laboratorio_codigo,
            ${PLAZO} AS vence_reserva_en, ${PLAZO} > statement_timestamp() AS admite_reservas,
            count(c.id)::int AS cantidad_computadoras,
            count(c.id) FILTER (WHERE c.estado_fisico = 'NORMAL' AND r.id IS NULL)::int AS cantidad_disponibles
       FROM sesion_practica s
       JOIN laboratorio l ON l.id = s.laboratorio_id
       LEFT JOIN computadora c ON c.laboratorio_id = l.id
       LEFT JOIN reserva r ON r.computadora_id = c.id AND ${VIGENTE}
      WHERE ${SESION_ABIERTA}
      GROUP BY s.id, l.id
      ORDER BY s.inicio, s.id`,
  );
  return rows;
}

async function buscarSesion(db, sesionId, bloquear = false) {
  if (bloquear) {
    // Mantiene el mismo orden de bloqueos que la desactivación: laboratorio, luego sesión.
    const { rowCount } = await db.query(
      `SELECT l.id FROM sesion_practica s JOIN laboratorio l ON l.id = s.laboratorio_id
        WHERE s.id = $1 AND ${SESION_ABIERTA} FOR SHARE OF l`,
      [sesionId]
    );
    if (!rowCount) return;
  }
  const { rows } = await db.query(
    `SELECT s.laboratorio_id, ${PLAZO} > clock_timestamp() AS admite_reservas
       FROM sesion_practica s JOIN laboratorio l ON l.id = s.laboratorio_id
      WHERE s.id = $1 AND ${SESION_ABIERTA}
      ${bloquear ? "FOR SHARE OF s" : ""}`,
    [sesionId]
  );
  return rows[0];
}

async function listarComputadoras(db, sesionId) {
  const { rows } = await db.query(
    `SELECT c.id, c.codigo_pc, ${ESTADO_PC} AS estado
       FROM sesion_practica s
       JOIN laboratorio l ON l.id = s.laboratorio_id
       JOIN computadora c ON c.laboratorio_id = s.laboratorio_id
       LEFT JOIN reserva r ON r.computadora_id = c.id AND ${VIGENTE}
      WHERE s.id = $1 AND ${SESION_ABIERTA}
      ORDER BY substring(c.codigo_pc FROM '^PC-([0-9]+)$')::numeric NULLS LAST, c.codigo_pc, c.id`,
    [sesionId]
  );
  return rows;
}

async function buscarActiva(db, estudianteId, soloManual = true) {
  const { rows } = await db.query(
    `SELECT r.id, r.sesion_id, r.computadora_id, c.codigo_pc, l.nombre AS laboratorio,
            s.inicio, r.creada_en, r.vence_en,
            CASE WHEN r.asistencia_confirmada_en IS NULL THEN 'Reservada'
                 ELSE 'Ocupada' END AS estado_pc
       FROM reserva r
       JOIN sesion_practica s ON s.id = r.sesion_id
       JOIN computadora c ON c.id = r.computadora_id
       JOIN laboratorio l ON l.id = r.laboratorio_id
      WHERE r.estudiante_id = $1 AND ${VIGENTE}
        ${soloManual ? `AND ${SESION_ABIERTA}` : ""}`,
    [estudianteId]
  );
  return rows[0] || null;
}

async function bloquearCuenta(db, estudianteId) {
  const { rowCount } = await db.query(
    "SELECT usuario_id FROM cuenta WHERE usuario_id = $1 FOR UPDATE",
    [estudianteId]
  );
  return rowCount > 0;
}

async function bloquearComputadora(db, computadoraId, laboratorioId) {
  const { rows } = await db.query(
    `SELECT estado_fisico FROM computadora
      WHERE id = $1 AND laboratorio_id = $2 FOR UPDATE`,
    [computadoraId, laboratorioId]
  );
  return rows[0];
}

async function expirar(db, estudianteId, computadoraId) {
  const { rowCount } = await db.query(
    `WITH vencidas AS (
       SELECT id FROM reserva
        WHERE expirada_en IS NULL AND cancelada_por_cierre_en IS NULL AND asistencia_confirmada_en IS NULL
          AND vence_en <= statement_timestamp()
          ${estudianteId === undefined ? "" : "AND (estudiante_id = $1 OR computadora_id = $2)"}
        ORDER BY id
        FOR UPDATE ${estudianteId === undefined ? "SKIP LOCKED" : ""}
     )
     UPDATE reserva r SET expirada_en = statement_timestamp()
       FROM vencidas v WHERE r.id = v.id`,
    estudianteId === undefined ? [] : [estudianteId, computadoraId]
  );
  return rowCount;
}

async function insertar(db, estudianteId, sesionId, computadoraId) {
  const { rows } = await db.query(
    `WITH reloj AS MATERIALIZED (SELECT clock_timestamp() AS ahora), creada AS (
       INSERT INTO reserva
         (estudiante_id, sesion_id, computadora_id, laboratorio_id, creada_en, vence_en)
       SELECT $1, s.id, $3, s.laboratorio_id, reloj.ahora, ${PLAZO}
         FROM sesion_practica s JOIN laboratorio l ON l.id = s.laboratorio_id
         CROSS JOIN reloj
        WHERE s.id = $2 AND ${SESION_ABIERTA} AND ${PLAZO} > reloj.ahora
       RETURNING id, sesion_id, computadora_id, laboratorio_id, creada_en, vence_en
     )
     SELECT r.id, r.sesion_id, r.computadora_id, c.codigo_pc, l.nombre AS laboratorio,
            s.inicio, r.creada_en, r.vence_en, 'Reservada' AS estado_pc
       FROM creada r
       JOIN sesion_practica s ON s.id = r.sesion_id
       JOIN computadora c ON c.id = r.computadora_id
       JOIN laboratorio l ON l.id = r.laboratorio_id`,
    [estudianteId, sesionId, computadoraId]
  );
  return rows[0];
}

async function registrarVinculo(db, estudianteId, sesionId) {
  await db.query(
    "INSERT INTO sesion_practica_estudiante (sesion_id, estudiante_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [sesionId, estudianteId]
  );
}

module.exports = {
  VIGENTE, ESTADO_PC,
  listarSesiones, buscarSesion, listarComputadoras, buscarActiva,
  bloquearCuenta, bloquearComputadora, expirar, insertar, registrarVinculo,
};
