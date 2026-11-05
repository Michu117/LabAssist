CREATE TABLE recuperacion_contrasena (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    usuario_id BIGINT NOT NULL
        REFERENCES usuario(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL UNIQUE,
    fecha_expiracion TIMESTAMPTZ NOT NULL,
    fecha_utilizacion TIMESTAMPTZ,
    fecha_creacion TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recuperacion_usuario
ON recuperacion_contrasena(usuario_id);