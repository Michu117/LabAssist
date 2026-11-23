const { Router } = require("express");
const { autenticar, sinCambioObligatorio, soloTecnicoDocente } = require("../../middlewares/autenticar");
const { validar } = require("../../middlewares/validar");
const controlador = require("./laboratorios.controller");
const { esquemaCrear, esquemaLaboratorio } = require("./laboratorios.schemas");

const router = Router();
router.use(autenticar, sinCambioObligatorio, soloTecnicoDocente);
router.get("/", controlador.listar);
router.post("/", validar(esquemaCrear), controlador.crear);
router.get("/:laboratorioId/computadoras", validar(esquemaLaboratorio, "params"), controlador.consultarComputadoras);

module.exports = router;
