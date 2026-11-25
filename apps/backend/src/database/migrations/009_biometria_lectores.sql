CREATE TABLE biometria_lector (
  id VARCHAR(100) PRIMARY KEY CHECK (id ~ '^[A-Za-z0-9_-]{1,100}$'),
  laboratorio_id BIGINT REFERENCES laboratorio(id),
  capacidad INTEGER NOT NULL CHECK (capacidad BETWEEN 1 AND 65535),
  habilitado BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE biometria_captura ADD COLUMN slot INTEGER CHECK (slot BETWEEN 1 AND 65535);
CREATE UNIQUE INDEX biometria_captura_lector_slot ON biometria_captura (dispositivo_id, slot)
  WHERE slot IS NOT NULL;

ALTER TABLE huella_estudiante ADD COLUMN slot INTEGER CHECK (slot BETWEEN 1 AND 65535);
CREATE UNIQUE INDEX huella_estudiante_lector_slot ON huella_estudiante (dispositivo_id, slot)
  WHERE slot IS NOT NULL;

CREATE TABLE biometria_modo (
  id CHAR(64) PRIMARY KEY,
  lector_id VARCHAR(100) NOT NULL UNIQUE REFERENCES biometria_lector(id),
  sesion_id BIGINT NOT NULL REFERENCES sesion_practica(id),
  vence_en TIMESTAMPTZ NOT NULL
);

CREATE TABLE biometria_identificacion (
  lector_id VARCHAR(100) NOT NULL REFERENCES biometria_lector(id),
  evento_id VARCHAR(64) NOT NULL,
  modo_id CHAR(64) NOT NULL,
  slot INTEGER NOT NULL,
  respuesta JSONB NOT NULL,
  PRIMARY KEY (lector_id, evento_id)
);
