ALTER TABLE laboratorio
  ADD COLUMN codigo VARCHAR(30),
  ADD CONSTRAINT laboratorio_codigo_uk UNIQUE (codigo),
  ADD CONSTRAINT laboratorio_codigo_formato_ck
    CHECK (codigo ~ '^[A-Z0-9][A-Z0-9_-]{0,29}$');
