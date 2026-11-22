const servicio = require("./reservas.service");

async function listarSesiones(req, res) {
  const sesiones = await servicio.listarSesiones();
  res.json({ ok: true, data: { sesiones } });
}

async function listarComputadoras(req, res) {
  const inventario = await servicio.listarComputadoras(req.params.sesionId);
  const computadoras = inventario
    .filter((pc) => pc.estado === "Disponible")
    .map(({ id, codigo_pc }) => ({ id, codigo_pc }));
  res.json({ ok: true, data: { computadoras, inventario } });
}

async function reservar(req, res) {
  const { reserva, creada } = await servicio.reservar(req.usuario.id, req.body);
  res.status(creada ? 201 : 200).json({ ok: true, data: reserva });
}

async function consultarActiva(req, res) {
  const reserva = await servicio.buscarActiva(req.usuario.id);
  res.json({ ok: true, data: reserva && { ...reserva, hora_servidor: new Date() } });
}

module.exports = { listarSesiones, listarComputadoras, reservar, consultarActiva };
