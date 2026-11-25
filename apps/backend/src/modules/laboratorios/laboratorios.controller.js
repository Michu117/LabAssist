const servicio = require("./laboratorios.service");

async function listar(req, res) {
  const laboratorios = await servicio.listar();
  res.json({ ok: true, data: { laboratorios } });
}

async function consultarComputadoras(req, res) {
  const data = await servicio.consultarComputadoras(req.params.laboratorioId);
  res.json({ ok: true, data });
}

async function crear(req, res) {
  const laboratorio = await servicio.crear(req.body);
  res.status(201).json({ ok: true, data: { laboratorio } });
}

async function listarLectores(req, res) {
  const lectores = await servicio.listarLectores();
  res.json({ ok: true, data: { lectores } });
}

async function crearLector(req, res) {
  const lector = await servicio.crearLector(req.body);
  res.status(201).json({ ok: true, data: { lector } });
}

async function asignarLector(req, res) {
  const lector = await servicio.asignarLector(req.params.lectorId, req.body.laboratorio_id);
  res.json({ ok: true, data: { lector } });
}

module.exports = { listar, consultarComputadoras, crear, listarLectores, crearLector, asignarLector };
