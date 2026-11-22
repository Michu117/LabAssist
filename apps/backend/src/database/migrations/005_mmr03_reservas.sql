CREATE TABLE laboratorio (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  ubicacion VARCHAR(150)
);

CREATE TABLE computadora (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  laboratorio_id BIGINT NOT NULL REFERENCES laboratorio(id),
  codigo_pc VARCHAR(50) NOT NULL,
  estado_fisico VARCHAR(10) NOT NULL DEFAULT 'NORMAL'
    CHECK (estado_fisico IN ('NORMAL', 'DAÑADA')),
  UNIQUE (laboratorio_id, codigo_pc),
  UNIQUE (id, laboratorio_id)
);

CREATE TABLE sesion_practica (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  laboratorio_id BIGINT NOT NULL REFERENCES laboratorio(id),
  inicio TIMESTAMPTZ NOT NULL,
  fin TIMESTAMPTZ NOT NULL,
  CHECK (inicio < fin),
  UNIQUE (id, laboratorio_id)
);

CREATE TABLE sesion_practica_estudiante (
  sesion_id BIGINT NOT NULL REFERENCES sesion_practica(id),
  estudiante_id BIGINT NOT NULL REFERENCES estudiante(usuario_id) ON DELETE CASCADE,
  PRIMARY KEY (sesion_id, estudiante_id)
);

CREATE INDEX sesion_practica_por_estudiante
  ON sesion_practica_estudiante (estudiante_id, sesion_id);

CREATE TABLE reserva (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sesion_id BIGINT NOT NULL,
  estudiante_id BIGINT NOT NULL REFERENCES cuenta(usuario_id) ON DELETE CASCADE,
  computadora_id BIGINT NOT NULL,
  laboratorio_id BIGINT NOT NULL,
  creada_en TIMESTAMPTZ NOT NULL,
  vence_en TIMESTAMPTZ NOT NULL,
  expirada_en TIMESTAMPTZ,
  asistencia_confirmada_en TIMESTAMPTZ,
  FOREIGN KEY (sesion_id, estudiante_id)
    REFERENCES sesion_practica_estudiante(sesion_id, estudiante_id) ON DELETE CASCADE,
  FOREIGN KEY (sesion_id, laboratorio_id) REFERENCES sesion_practica(id, laboratorio_id),
  FOREIGN KEY (computadora_id, laboratorio_id) REFERENCES computadora(id, laboratorio_id),
  CHECK (creada_en < vence_en),
  CHECK (expirada_en IS NULL OR
    (expirada_en >= vence_en AND asistencia_confirmada_en IS NULL)),
  CHECK (asistencia_confirmada_en IS NULL OR
    (asistencia_confirmada_en >= creada_en AND asistencia_confirmada_en < vence_en))
);

CREATE UNIQUE INDEX reserva_pc_vigente
  ON reserva (computadora_id) WHERE expirada_en IS NULL;
CREATE UNIQUE INDEX reserva_estudiante_vigente
  ON reserva (estudiante_id) WHERE expirada_en IS NULL;
CREATE INDEX reserva_por_vencer
  ON reserva (vence_en) WHERE expirada_en IS NULL AND asistencia_confirmada_en IS NULL;
