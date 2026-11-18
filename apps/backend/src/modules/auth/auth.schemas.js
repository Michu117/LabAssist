const { z } = require("zod");

const {
  esquemaCorreo,
  esquemaCedula,
  esquemaContrasena,
} = require("../../validaciones");

// HU-02: autoregistro de estudiante con datos personales y cuenta.
// La huella y la clave temporal quedan para MMR-02.
const esquemaRegistro = z
  .object({
    nombre: z
      .string({ error: "El nombre es obligatorio" })
      .trim()
      .min(1, "El nombre no puede estar vacío")
      .max(100, "El nombre no puede superar 100 caracteres"),
    apellido: z
      .string({ error: "El apellido es obligatorio" })
      .trim()
      .min(1, "El apellido no puede estar vacío")
      .max(100, "El apellido no puede superar 100 caracteres"),
    cedula: esquemaCedula,
    correo: esquemaCorreo,
    contrasena: esquemaContrasena,
    confirmar_contrasena: z
      .string({ error: "Confirma la contraseña" })
      .min(8, "La contraseña debe tener entre 8 y 72 caracteres")
      .max(72, "La contraseña debe tener entre 8 y 72 caracteres"),
    carrera: z
      .string({ error: "La carrera es obligatoria" })
      .trim()
      .min(1, "La carrera no puede estar vacía")
      .max(100, "La carrera no puede superar 100 caracteres"),
    ciclo: z
      .string({ error: "El ciclo es obligatorio" })
      .trim()
      .min(1, "El ciclo no puede estar vacío")
      .max(20, "El ciclo no puede superar 20 caracteres"),
  })
  .strict()
  .refine((datos) => datos.contrasena === datos.confirmar_contrasena, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar_contrasena"],
  });

const esquemaSolicitarRecuperacion = z
  .object({
    correo: esquemaCorreo,
  })
  .strict();

const esquemaRestablecerContrasena = z
  .object({
    token: z.string().regex(/^[a-f0-9]{64}$/, "Token inválido"),
    contrasena: esquemaContrasena,
    confirmar_contrasena: esquemaContrasena,
  })
  .strict()
  .refine(
    (datos) => datos.contrasena === datos.confirmar_contrasena,
    {
      message: "Las contraseñas no coinciden",
      path: ["confirmar_contrasena"],
    }
  );  

  // HU-01: inicio de sesión con correo institucional y contraseña.
const esquemaLogin = z
  .object({
    correo: esquemaCorreo,
    contrasena: esquemaContrasena,
  })
  .strict();


module.exports = {
  esquemaRegistro,
  esquemaLogin,
  esquemaSolicitarRecuperacion,
  esquemaRestablecerContrasena,
};