const { z } = require("zod");

const esquemaCrear = z.object({
  codigo: z.string().trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,29}$/, "El código debe tener de 1 a 30 caracteres alfanuméricos, guiones o guiones bajos")
    .toUpperCase(),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  cantidad_computadoras: z.number().int().min(1).max(999),
}).strict();

const esquemaLaboratorio = z.object({
  laboratorioId: z.string().regex(/^[1-9][0-9]*$/).transform(Number)
    .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)),
});

module.exports = { esquemaCrear, esquemaLaboratorio };
