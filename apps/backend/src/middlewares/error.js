const ErrorApi = require("../errores");

function manejarNoEncontrado(req, res) {
  res.status(404).json({
    ok: false,
    error: {
      codigo: "NO_ENCONTRADO",
      mensaje: "Recurso no encontrado",
      detalles: [],
    },
  });
}

function manejarError(err, req, res, next) {
  if (err instanceof ErrorApi) {
    return res.status(err.status).json({
      ok: false,
      error: {
        codigo: err.codigo,
        mensaje: err.mensaje,
        detalles: err.detalles,
      },
    });
  }

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({
      ok: false,
      error: {
        codigo: "VALIDACION",
        mensaje: "Los datos enviados no son válidos",
        detalles: [],
      },
    });
  }

  console.error(err);
  res.status(500).json({
    ok: false,
    error: {
      codigo: "INTERNO",
      mensaje: "Error interno del servidor",
      detalles: [],
    },
  });
}

module.exports = { manejarNoEncontrado, manejarError };
