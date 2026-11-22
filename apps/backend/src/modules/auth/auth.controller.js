const servicio = require("./auth.service");

async function registrar(req, res, next) {
  try {
    const usuario = await servicio.registrarEstudiante(req.body);
    res.status(201).json({ ok: true, data: { usuario } });
  } catch (error) {
    next(error);
  }
}

async function iniciarSesion(req, res, next) {
  try {
    const resultado = await servicio.iniciarSesion(req.body);
    res.status(200).json({ ok: true, data: resultado });
  } catch (error) {
    next(error);
  }
}

module.exports = { registrar, iniciarSesion };
