const servicio = require("./biometria.service");

async function iniciar(req, res, next) {
  try {
    const captura = await servicio.iniciarCaptura(
      req.usuario.id,
      req.body.dispositivo_id
    );
    res.status(201).json({ ok: true, data: captura });
  } catch (error) {
    next(error);
  }
}

async function consultar(req, res, next) {
  try {
    const captura = await servicio.consultarCaptura(req.params.id);
    res.status(200).json({ ok: true, data: { captura } });
  } catch (error) {
    next(error);
  }
}

module.exports = { iniciar, consultar };
