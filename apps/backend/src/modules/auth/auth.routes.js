const { Router } = require("express");

const { validar } = require("../../middlewares/validar");
const controlador = require("./auth.controller");
const {
  esquemaRegistro,
  esquemaLogin,
  esquemaSolicitarRecuperacion,
  esquemaRestablecerContrasena,
} = require("./auth.schemas");
const router = Router();

// Públicos
router.post("/registro", validar(esquemaRegistro), controlador.registrar);
router.post("/login", validar(esquemaLogin), controlador.iniciarSesion);

router.post(
  "/forgot-password",
  validar(esquemaSolicitarRecuperacion),
  controlador.solicitarRecuperacion
);

router.post(
  "/reset-password",
  validar(esquemaRestablecerContrasena),
  controlador.restablecerContrasena
);
module.exports = router;
