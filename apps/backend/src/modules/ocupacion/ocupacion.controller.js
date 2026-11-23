const servicio = require("./ocupacion.service");

async function listarLaboratorios(req, res) {
  const laboratorios = await servicio.listarLaboratorios();
  res.json({ ok: true, data: { laboratorios } });
}

async function consultarPlano(req, res) {
  const data = await servicio.consultarPlano(req.params.laboratorioId);
  res.json({ ok: true, data });
}

async function consultarOcupante(req, res) {
  const { laboratorioId, computadoraId } = req.params;
  const data = await servicio.consultarOcupante(laboratorioId, computadoraId);
  res.json({ ok: true, data });
}

function responsable(usuario) {
  return { id: usuario.id, nombre: `${usuario.nombre} ${usuario.apellido}` };
}

async function abrirSesion(req, res) {
  const sesion = await servicio.abrirSesion(req.params.laboratorioId, responsable(req.usuario));
  res.status(201).json({ ok: true, data: { sesion } });
}

async function finalizarSesion(req, res) {
  const { laboratorioId, sesionId } = req.params;
  const sesion = await servicio.finalizarSesion(laboratorioId, sesionId, responsable(req.usuario), req.body.desocupado);
  res.json({ ok: true, data: { sesion } });
}

module.exports = { listarLaboratorios, consultarPlano, consultarOcupante, abrirSesion, finalizarSesion };
