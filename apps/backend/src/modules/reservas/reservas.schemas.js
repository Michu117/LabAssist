const { z } = require("zod");

const id = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const esquemaSesion = z.object({
  sesionId: z.string().regex(/^[1-9][0-9]*$/).transform(Number).pipe(id),
});
const esquemaReserva = z.object({ sesionId: id, computadoraId: id }).strict();

module.exports = { esquemaSesion, esquemaReserva };
