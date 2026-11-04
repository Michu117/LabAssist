const { Router } = require("express");

const { autenticar, soloTecnicoDocente } = require("../../middlewares/autenticar");
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
router.get("/me", autenticar, controlador.obtenerPerfil);
router.patch("/me", autenticar, validar(esquemaEditarPerfil), controlador.editarPerfil);
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
  soloTecnicoDocente,
  validar(esquemaListarUsuarios, "query"),
  controlador.listar
);
router.post(
  "/",
  autenticar,
  soloTecnicoDocente,
  validar(esquemaCrearTecnico),
  controlador.crear
);
router.get(
  "/:id",
  autenticar,
  soloTecnicoDocente,
  validar(esquemaId, "params"),
  controlador.consultar
);
router.patch(
  "/:id",
  autenticar,
  soloTecnicoDocente,
  validar(esquemaId, "params"),
  validar(esquemaEditarUsuario),
  controlador.editar
);
router.delete(
  "/:id",
  autenticar,
  soloTecnicoDocente,
  validar(esquemaId, "params"),
  controlador.eliminar
);

module.exports = router;
