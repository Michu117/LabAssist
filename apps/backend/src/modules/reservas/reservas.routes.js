const { Router } = require("express");
const ErrorApi = require("../../errores");
const { autenticar, sinCambioObligatorio } = require("../../middlewares/autenticar");
const { validar } = require("../../middlewares/validar");
const controlador = require("./reservas.controller");
const { esquemaSesion, esquemaReserva } = require("./reservas.schemas");

const router = Router();

function soloEstudiante(req, res, next) {
  if (req.usuario.tipo !== "ESTUDIANTE") {
    return next(new ErrorApi(403, "PROHIBIDO", "Solo los estudiantes pueden reservar computadoras"));
  }
  return next();
}

router.use(autenticar, sinCambioObligatorio, soloEstudiante);
router.get("/sesiones", controlador.listarSesiones);
router.get("/sesiones/:sesionId/computadoras", validar(esquemaSesion, "params"), controlador.listarComputadoras);
router.post("/", validar(esquemaReserva), controlador.reservar);
router.get("/me/activa", controlador.consultarActiva);

module.exports = router;
