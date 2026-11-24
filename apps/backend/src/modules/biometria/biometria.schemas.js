const { z } = require("zod");

const esquemaIdCaptura = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/, "El identificador de captura no es válido"),
});

const esquemaIniciarCaptura = z
  .object({
    dispositivo_id: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

module.exports = {
  esquemaIdCaptura,
  esquemaIniciarCaptura,
};
