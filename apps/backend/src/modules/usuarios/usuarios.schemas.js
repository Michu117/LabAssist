const { z } = require("zod");

const { esquemaCorreo, esquemaCedula, esquemaContrasena } = require("../../validaciones");

const esquemaNombre = z
  .string({ error: "El nombre es obligatorio" })
  .trim()
  .min(1, "El nombre no puede estar vacío")
  .max(100, "El nombre no puede superar 100 caracteres");

// Campos editables desde el perfil propio. correo, cedula, tipo y huella
// quedan fuera; la contraseña tiene su propio endpoint.
const esquemaEditarPerfil = z
  .object({
    nombre: esquemaNombre.optional(),
    apellido: esquemaNombre.optional(),
    carrera: z
      .string({ error: "La carrera es obligatoria" })
      .trim()
      .min(1, "La carrera no puede estar vacía")
      .max(100, "La carrera no puede superar 100 caracteres")
      .optional(),
    ciclo: z
      .string({ error: "El ciclo es obligatorio" })
      .trim()
      .min(1, "El ciclo no puede estar vacío")
      .max(20, "El ciclo no puede superar 20 caracteres")
      .optional(),
  })
  .strict();

const esquemaCambiarContrasena = z
  .object({
    contrasena_actual: esquemaContrasena,
    contrasena: esquemaContrasena,
    confirmar_contrasena: z
      .string({ error: "Confirma la contraseña" })
      .min(8, "La contraseña debe tener entre 8 y 72 caracteres")
      .max(72, "La contraseña debe tener entre 8 y 72 caracteres"),
  })
  .strict()
  .refine((datos) => datos.contrasena === datos.confirmar_contrasena, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar_contrasena"],
  });

// Creación de un Técnico Docente por otro Técnico Docente.
const esquemaCrearTecnico = z
  .object({
    nombre: esquemaNombre,
    apellido: esquemaNombre,
    cedula: esquemaCedula,
    correo: esquemaCorreo,
    contrasena: esquemaContrasena,
    confirmar_contrasena: z
      .string({ error: "Confirma la contraseña" })
      .min(8, "La contraseña debe tener entre 8 y 72 caracteres")
      .max(72, "La contraseña debe tener entre 8 y 72 caracteres"),
  })
  .strict()
  .refine((datos) => datos.contrasena === datos.confirmar_contrasena, {
    message: "Las contraseñas no coinciden",
    path: ["confirmar_contrasena"],
  });

// Edición por el Técnico Docente: no incluye tipo ni huella, y clave solo
// existe en el endpoint de cambio de contraseña.
const esquemaEditarUsuario = z
  .object({
    nombre: esquemaNombre.optional(),
    apellido: esquemaNombre.optional(),
    cedula: esquemaCedula.optional(),
    correo: esquemaCorreo.optional(),
    carrera: z
      .string({ error: "La carrera es obligatoria" })
      .trim()
      .min(1, "La carrera no puede estar vacía")
      .max(100, "La carrera no puede superar 100 caracteres")
      .optional(),
    ciclo: z
      .string({ error: "El ciclo es obligatorio" })
      .trim()
      .min(1, "El ciclo no puede estar vacío")
      .max(20, "El ciclo no puede superar 20 caracteres")
      .optional(),
  })
  .strict();

const esquemaListarUsuarios = z
  .object({
    pagina: z.coerce.number().int().min(1, "La página debe ser al menos 1").default(1),
    limite: z.coerce
      .number()
      .int()
      .min(1, "El límite debe estar entre 1 y 100")
      .max(100, "El límite debe estar entre 1 y 100")
      .default(20),
    tipo: z.enum(["ESTUDIANTE", "TECNICO_DOCENTE"]).optional(),
    busqueda: z.string().trim().max(150, "La búsqueda no puede superar 150 caracteres").optional(),
  })
  .strict();

const esquemaId = z.object({
  id: z.coerce.number().int().positive("El identificador no es válido"),
});

module.exports = {
  esquemaEditarPerfil,
  esquemaCambiarContrasena,
  esquemaCrearTecnico,
  esquemaEditarUsuario,
  esquemaListarUsuarios,
  esquemaId,
};
