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

module.exports = { listar, consultarComputadoras, crear };
