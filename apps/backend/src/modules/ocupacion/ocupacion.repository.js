const { VIGENTE, ESTADO_PC } = require("../reservas/reservas.repository");

async function listarLaboratorios(db) {
  const { rows } = await db.query(
    "SELECT id, nombre, ubicacion FROM laboratorio ORDER BY nombre, id"
  );
  return rows;
}

async function consultarPlano(db, laboratorioId, lectores) {
  const { rows } = await db.query(
    `WITH equipos AS (
       SELECT c.id, c.codigo_pc, c.fila, c.columna, c.estado_fisico,
              r.estudiante_id, ${ESTADO_PC} AS estado
         FROM computadora c
         LEFT JOIN reserva r ON r.computadora_id = c.id AND ${VIGENTE}
        WHERE c.laboratorio_id = $1
     )
     SELECT l.id, l.nombre, l.ubicacion, l.habilitado,
            EXISTS (SELECT 1 FROM biometria_lector b
                    WHERE b.laboratorio_id = l.id AND b.habilitado AND b.id = ANY($2::text[])) AS asistencia_integrada,
            (SELECT to_jsonb(s) FROM sesion_practica s
              WHERE s.laboratorio_id = l.id AND s.estado IS NOT NULL
              ORDER BY (s.estado = 'ABIERTA') DESC, s.inicio DESC, s.id DESC LIMIT 1) AS sesion,
            COALESCE(jsonb_agg(jsonb_build_object(
              'id', e.id, 'codigo_pc', e.codigo_pc, 'fila', e.fila, 'columna', e.columna,
              'estado', e.estado, 'estado_fisico', e.estado_fisico
            ) ORDER BY e.fila, e.columna, e.codigo_pc) FILTER (WHERE e.id IS NOT NULL), '[]') AS computadoras,
            count(e.id)::int AS total,
            count(*) FILTER (WHERE e.estado = 'Disponible')::int AS disponibles,
            count(*) FILTER (WHERE e.estado = 'Reservada')::int AS reservadas,
            count(*) FILTER (WHERE e.estado = 'Inactiva')::int AS inactivas,
            count(*) FILTER (WHERE e.estado = 'Ocupada')::int AS ocupadas,
            count(DISTINCT e.estudiante_id) FILTER (WHERE e.estado = 'Ocupada')::int AS presentes,
            COALESCE(round(100.0 * count(*) FILTER (WHERE e.estado = 'Ocupada') /
              NULLIF(count(e.id), 0), 2), 0)::float8 AS porcentaje_ocupacion
       FROM laboratorio l
       LEFT JOIN equipos e ON true
      WHERE l.id = $1
      GROUP BY l.id`,
    [laboratorioId, lectores]
  );
  return rows[0];
}

async function consultarOcupante(db, laboratorioId, computadoraId) {
  const { rows } = await db.query(
    `SELECT r.asistencia_confirmada_en AS ingreso_en, u.nombre, u.apellido,
            u.cedula AS identificacion
       FROM computadora c
       LEFT JOIN reserva r ON r.computadora_id = c.id AND ${VIGENTE}
                           AND r.asistencia_confirmada_en IS NOT NULL
       LEFT JOIN usuario u ON u.id = r.estudiante_id
      WHERE c.laboratorio_id = $1 AND c.id = $2`,
    [laboratorioId, computadoraId]
  );
  return rows[0];
}

module.exports = { listarLaboratorios, consultarPlano, consultarOcupante };
