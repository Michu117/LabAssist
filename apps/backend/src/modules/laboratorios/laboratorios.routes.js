const { Router } = require("express");
const { autenticar, sinCambioObligatorio, soloTecnicoDocente } = require("../../middlewares/autenticar");
const { validar } = require("../../middlewares/validar");
const controlador = require("./laboratorios.controller");
const {
  esquemaCrear, esquemaLaboratorio, esquemaLectorId, esquemaLector, esquemaAsignarLector,
} = require("./laboratorios.schemas");

const router = Router();
router.use(autenticar, sinCambioObligatorio, soloTecnicoDocente);
router.get("/", controlador.listar);
router.post("/", validar(esquemaCrear), controlador.crear);
router.get("/lectores", controlador.listarLectores);
router.post("/lectores", validar(esquemaLector), controlador.crearLector);
router.patch("/lectores/:lectorId", validar(esquemaLectorId, "params"), validar(esquemaAsignarLector), controlador.asignarLector);
router.get("/:laboratorioId/computadoras", validar(esquemaLaboratorio, "params"), controlador.consultarComputadoras);

module.exports = router;
