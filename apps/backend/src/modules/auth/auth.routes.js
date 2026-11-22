const { Router } = require("express");

const { validar } = require("../../middlewares/validar");
const controlador = require("./auth.controller");
const { esquemaRegistro, esquemaLogin } = require("./auth.schemas");

const router = Router();

// Públicos
router.post("/registro", validar(esquemaRegistro), controlador.registrar);
router.post("/login", validar(esquemaLogin), controlador.iniciarSesion);

module.exports = router;
