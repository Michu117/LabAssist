const { z } = require("zod");

const id = z.string().regex(/^[1-9][0-9]*$/).transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));
const esquemaLaboratorio = z.object({ laboratorioId: id });
const esquemaComputadora = esquemaLaboratorio.extend({ computadoraId: id });
const esquemaSesion = esquemaLaboratorio.extend({ sesionId: id });
const esquemaAbrir = z.object({}).strict().default({});
const esquemaFinalizar = z.object({ desocupado: z.boolean().default(false) }).strict().default({ desocupado: false });

module.exports = { esquemaLaboratorio, esquemaComputadora, esquemaSesion, esquemaAbrir, esquemaFinalizar };
