ALTER TABLE computadora
  ADD COLUMN fila INTEGER,
  ADD COLUMN columna INTEGER,
  ADD CONSTRAINT computadora_posicion_completa_ck CHECK (
    (fila IS NULL AND columna IS NULL) OR
    (fila IS NOT NULL AND columna IS NOT NULL AND fila > 0 AND columna > 0)
  ),
  ADD CONSTRAINT computadora_posicion_por_laboratorio_uk
    UNIQUE (laboratorio_id, fila, columna);
