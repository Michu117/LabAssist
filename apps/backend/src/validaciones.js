const { z } = require("zod");

// Correo institucional: formato válido, en minúsculas y terminado en
// @unl.edu.ec (RF02 y HU-01).
const esquemaCorreo = z
  .string({ error: "El correo es obligatorio" })
  .trim()
  .toLowerCase()
  .refine((valor) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor), {
    message: "El correo no tiene un formato válido",
  })
  .refine((valor) => valor.endsWith("@unl.edu.ec"), {
    message: "El correo debe terminar en @unl.edu.ec",
  });

const esquemaCedula = z
  .string({ error: "La cédula es obligatoria" })
  .trim()
  .refine((valor) => /^\d{10}$/.test(valor), {
    message: "La cédula debe tener exactamente 10 dígitos",
  });

// Entre 8 y 72 caracteres: bcrypt limita la contraseña a 72.
const esquemaContrasena = z
  .string({ error: "La contraseña es obligatoria" })
  .min(8, "La contraseña debe tener entre 8 y 72 caracteres")
  .max(72, "La contraseña debe tener entre 8 y 72 caracteres");

module.exports = { esquemaCorreo, esquemaCedula, esquemaContrasena };
