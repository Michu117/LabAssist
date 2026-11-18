const { Router } = require("express");

const { autenticar, soloTecnicoDocente } = require("../../middlewares/autenticar");
const { validar } = require("../../middlewares/validar");
const controlador = require("./biometria.controller");
const {
  esquemaIdCaptura,
  esquemaIniciarCaptura,
} = require("./biometria.schemas");

const router = Router();

// El técnico activa una captura. El backend ordena la captura por MQTT.
router.post(
  "/capturas",
  autenticar,
  soloTecnicoDocente,
  validar(esquemaIniciarCaptura),
  controlador.iniciar
);
router.get(
  "/capturas/:id",
  autenticar,
  soloTecnicoDocente,
  validar(esquemaIdCaptura, "params"),
  controlador.consultar
);

module.exports = router;
