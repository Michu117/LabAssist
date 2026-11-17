ALTER TABLE cuenta
  ADD COLUMN debe_cambiar_contrasena BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE biometria_captura (
  id                  VARCHAR(64) PRIMARY KEY,
  token_hash          CHAR(64) NOT NULL UNIQUE,
  estado              VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
  plantilla           TEXT,
  dispositivo_id      VARCHAR(100),
  creada_por          BIGINT NOT NULL REFERENCES usuario(id),
  creada_en           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completada_en       TIMESTAMPTZ,
  expira_en           TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  CONSTRAINT biometria_captura_estado_ck
    CHECK (estado IN ('PENDIENTE', 'COMPLETADA', 'USADA', 'EXPIRADA')),
  CONSTRAINT biometria_captura_plantilla_ck
    CHECK (estado = 'PENDIENTE' OR plantilla IS NOT NULL)
);

CREATE TABLE huella_estudiante (
  usuario_id          BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  plantilla           TEXT NOT NULL,
  dispositivo_id      VARCHAR(100),
  registrada_en       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
