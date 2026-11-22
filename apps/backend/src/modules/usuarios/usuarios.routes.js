const { Router } = require("express");

const {
  autenticar,
  soloTecnicoDocente,
  sinCambioObligatorio,
} = require("../../middlewares/autenticar");
const { validar } = require("../../middlewares/validar");
const controlador = require("./usuarios.controller");
const {
  esquemaEditarPerfil,
  esquemaCambiarContrasena,
  esquemaCrearTecnico,
  esquemaEditarUsuario,
  esquemaListarUsuarios,
  esquemaId,
} = require("./usuarios.schemas");

const router = Router();

// /me se registra antes que /usuarios/:id para que Express no interprete
// "me" como un identificador.
router.get("/me", autenticar, sinCambioObligatorio, controlador.obtenerPerfil);
router.patch("/me", autenticar, sinCambioObligatorio, validar(esquemaEditarPerfil), controlador.editarPerfil);
router.patch(
  "/me/contrasena",
  autenticar,
  validar(esquemaCambiarContrasena),
  controlador.cambiarContrasena
);

// Administración de usuarios: solo Técnico Docente.
router.get(
  "/",
  autenticar,
  sinCambioObligatorio,
  soloTecnicoDocente,
  validar(esquemaListarUsuarios, "query"),
  controlador.listar
);
router.post(
  "/",
  autenticar,
  sinCambioObligatorio,
  soloTecnicoDocente,
  validar(esquemaCrearTecnico),
  controlador.crear
);
router.get(
  "/:id",
  autenticar,
  sinCambioObligatorio,
  soloTecnicoDocente,
  validar(esquemaId, "params"),
  controlador.consultar
);
router.patch(
  "/:id",
  autenticar,
  sinCambioObligatorio,
  soloTecnicoDocente,
  validar(esquemaId, "params"),
  validar(esquemaEditarUsuario),
  controlador.editar
);
router.delete(
  "/:id",
  autenticar,
  sinCambioObligatorio,
  soloTecnicoDocente,
  validar(esquemaId, "params"),
  controlador.eliminar
);

module.exports = router;
