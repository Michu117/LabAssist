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
    const captura = await servicio.consultarCaptura(req.params.id, req.usuario.id);
    res.status(200).json({ ok: true, data: { captura } });
  } catch (error) {
    next(error);
  }
}

async function identificar(req, res, next) {
  try {
    const modo = await servicio.iniciarIdentificacion(req.body.dispositivo_id);
    res.status(202).json({ ok: true, data: modo });
  } catch (error) {
    next(error);
  }
}

module.exports = { iniciar, consultar, identificar };
