const { Router } = require("express");
const { autenticar, sinCambioObligatorio, soloTecnicoDocente } = require("../../middlewares/autenticar");
const { validar } = require("../../middlewares/validar");
const controlador = require("./ocupacion.controller");
const {
  esquemaLaboratorio, esquemaComputadora, esquemaSesion, esquemaAbrir, esquemaFinalizar,
} = require("./ocupacion.schemas");

const router = Router();

router.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
router.use(autenticar, sinCambioObligatorio, soloTecnicoDocente);
router.get("/laboratorios", controlador.listarLaboratorios);
router.get("/laboratorios/:laboratorioId", validar(esquemaLaboratorio, "params"), controlador.consultarPlano);
router.post("/laboratorios/:laboratorioId/sesiones",
  validar(esquemaLaboratorio, "params"), validar(esquemaAbrir), controlador.abrirSesion);
router.post("/laboratorios/:laboratorioId/sesiones/:sesionId/finalizar",
  validar(esquemaSesion, "params"), validar(esquemaFinalizar), controlador.finalizarSesion);
router.get(
  "/laboratorios/:laboratorioId/computadoras/:computadoraId/ocupante",
  validar(esquemaComputadora, "params"),
  controlador.consultarOcupante
);

module.exports = router;
