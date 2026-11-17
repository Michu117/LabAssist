ALTER TABLE biometria_captura
  ALTER COLUMN token_hash DROP NOT NULL;

ALTER TABLE biometria_captura
  DROP CONSTRAINT biometria_captura_estado_ck;

ALTER TABLE biometria_captura
  DROP CONSTRAINT biometria_captura_plantilla_ck;

ALTER TABLE biometria_captura
  ADD COLUMN error_mensaje TEXT,
  ADD CONSTRAINT biometria_captura_estado_ck
    CHECK (estado IN ('PENDIENTE', 'COMPLETADA', 'USADA', 'EXPIRADA', 'ERROR')),
  ADD CONSTRAINT biometria_captura_plantilla_ck
    CHECK (estado IN ('PENDIENTE', 'ERROR') OR plantilla IS NOT NULL);
