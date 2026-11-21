ALTER TABLE laboratorio ADD COLUMN habilitado BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE sesion_practica
  ALTER COLUMN fin DROP NOT NULL,
  ADD COLUMN estado VARCHAR(12),
  ADD COLUMN abierta_por_id BIGINT,
  ADD COLUMN abierta_por_nombre TEXT,
  ADD COLUMN finalizada_por_id BIGINT,
  ADD COLUMN finalizada_por_nombre TEXT,
  ADD CONSTRAINT sesion_practica_ciclo_ck CHECK (
    (estado IS NULL AND fin IS NOT NULL
      AND abierta_por_id IS NULL AND abierta_por_nombre IS NULL
      AND finalizada_por_id IS NULL AND finalizada_por_nombre IS NULL)
    OR
    (estado IS NOT NULL AND abierta_por_id IS NOT NULL AND abierta_por_nombre IS NOT NULL
      AND ((estado = 'ABIERTA' AND fin IS NULL
          AND finalizada_por_id IS NULL AND finalizada_por_nombre IS NULL)
        OR (estado = 'FINALIZADA' AND fin IS NOT NULL
          AND finalizada_por_id IS NOT NULL AND finalizada_por_nombre IS NOT NULL)))
  );

CREATE UNIQUE INDEX sesion_practica_abierta_por_laboratorio
  ON sesion_practica (laboratorio_id) WHERE estado = 'ABIERTA';
CREATE INDEX sesion_practica_manual_reciente
  ON sesion_practica (laboratorio_id, inicio DESC, id DESC) WHERE estado IS NOT NULL;

ALTER TABLE reserva
  ADD COLUMN cancelada_por_cierre_en TIMESTAMPTZ,
  ADD COLUMN ocupacion_finalizada_en TIMESTAMPTZ,
  ADD CONSTRAINT reserva_cierre_ck CHECK (
    (cancelada_por_cierre_en IS NULL OR
      (asistencia_confirmada_en IS NULL AND expirada_en IS NULL
       AND cancelada_por_cierre_en >= creada_en AND cancelada_por_cierre_en < vence_en))
    AND
    (ocupacion_finalizada_en IS NULL OR
      (asistencia_confirmada_en IS NOT NULL AND ocupacion_finalizada_en >= asistencia_confirmada_en))
  );

DROP INDEX reserva_pc_vigente;
DROP INDEX reserva_estudiante_vigente;
DROP INDEX reserva_por_vencer;

CREATE UNIQUE INDEX reserva_pc_vigente ON reserva (computadora_id)
  WHERE expirada_en IS NULL AND cancelada_por_cierre_en IS NULL AND ocupacion_finalizada_en IS NULL;
CREATE UNIQUE INDEX reserva_estudiante_vigente ON reserva (estudiante_id)
  WHERE expirada_en IS NULL AND cancelada_por_cierre_en IS NULL AND ocupacion_finalizada_en IS NULL;
CREATE INDEX reserva_por_vencer ON reserva (vence_en)
  WHERE expirada_en IS NULL AND cancelada_por_cierre_en IS NULL AND asistencia_confirmada_en IS NULL;
