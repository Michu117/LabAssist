const { z } = require("zod");

// Algoritmo de la cédula ecuatoriana: los dos primeros dígitos identifican la
// provincia (01 a 24) y el último dígito se calcula sobre los primeros nueve.
function cedulaEcuatorianaValida(cedula) {
  if (!/^\d{10}$/.test(cedula)) return false;

  const provincia = Number(cedula.slice(0, 2));
  if (provincia < 1 || provincia > 24) return false;

  const digitos = [...cedula].map(Number);
  let suma = 0;
  for (let indice = 0; indice < 9; indice += 1) {
    let digito = digitos[indice];
    if (indice % 2 === 0) {
      digito *= 2;
      if (digito > 9) digito -= 9;
    }
    suma += digito;
  }

  const verificador = (10 - (suma % 10)) % 10;
  return verificador === digitos[9];
}

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
  })
  .refine((valor) => cedulaEcuatorianaValida(valor), {
    message: "La cédula no es válida",
  });

// Entre 8 y 72 caracteres: bcrypt limita la contraseña a 72.
const esquemaContrasena = z
  .string({ error: "La contraseña es obligatoria" })
  .min(8, "La contraseña debe tener entre 8 y 72 caracteres")
  .max(72, "La contraseña debe tener entre 8 y 72 caracteres");

module.exports = { cedulaEcuatorianaValida, esquemaCorreo, esquemaCedula, esquemaContrasena };
