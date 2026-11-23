const { z } = require("zod");

const esquemaIdCaptura = z.object({
  id: z.string().regex(/^[a-f0-9]{64}$/, "El identificador de captura no es válido"),
});

const esquemaIniciarCaptura = z
  .object({
    dispositivo_id: z.string().trim().regex(/^[A-Za-z0-9_-]{1,100}$/).optional(),
  })
  .strict()
  .default({});

module.exports = {
  esquemaIdCaptura,
  esquemaIniciarCaptura,
};
