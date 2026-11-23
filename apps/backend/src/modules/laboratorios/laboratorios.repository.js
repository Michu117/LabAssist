async function listar(db) {
  const { rows } = await db.query(
    `SELECT l.id, l.codigo, l.nombre, count(c.id)::int AS cantidad_computadoras
       FROM laboratorio l
       LEFT JOIN computadora c ON c.laboratorio_id = l.id
      GROUP BY l.id
      ORDER BY l.nombre, l.codigo, l.id`
  );
  return rows;
}

async function consultarComputadoras(db, laboratorioId) {
  const { rows } = await db.query(
    `SELECT l.id, l.codigo, l.nombre,
            count(c.id)::int AS cantidad_computadoras,
            COALESCE(jsonb_agg(
              jsonb_build_object('id', c.id, 'codigo_pc', c.codigo_pc, 'estado_fisico', c.estado_fisico)
              ORDER BY substring(c.codigo_pc FROM '^PC-([0-9]+)$')::numeric NULLS LAST,
                       c.codigo_pc, c.id
            ) FILTER (WHERE c.id IS NOT NULL), '[]') AS computadoras
       FROM laboratorio l
       LEFT JOIN computadora c ON c.laboratorio_id = l.id
      WHERE l.id = $1
      GROUP BY l.id`,
    [laboratorioId]
  );
  return rows[0];
}

async function insertarLaboratorio(db, codigo, nombre) {
  const { rows } = await db.query(
    "INSERT INTO laboratorio (codigo, nombre, habilitado) VALUES ($1, $2, false) RETURNING id, codigo, nombre",
    [codigo, nombre]
  );
  return rows[0];
}

async function generarComputadoras(db, laboratorioId, cantidad) {
  const { rowCount } = await db.query(
    `INSERT INTO computadora (laboratorio_id, codigo_pc, estado_fisico)
     SELECT $1, 'PC-' || lpad(numero::text, greatest(2, length(numero::text)), '0'), 'NORMAL'
       FROM generate_series(1, $2::integer) AS serie(numero)
      ORDER BY numero`,
    [laboratorioId, cantidad]
  );
  return rowCount;
}

module.exports = { listar, consultarComputadoras, insertarLaboratorio, generarComputadoras };
