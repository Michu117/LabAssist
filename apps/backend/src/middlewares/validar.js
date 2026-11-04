// Valida una parte de la petición con un esquema Zod. Rechaza los campos no
// permitidos (los esquemas usan .strict()) y reemplaza el dato con la
// versión ya transformada (recorte, minúsculas, etc.).
function validar(esquema, fuente = "body") {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req[fuente]);

    if (!resultado.success) {
      return res.status(400).json({
        ok: false,
        error: {
          codigo: "VALIDACION",
          mensaje: "Los datos enviados no son válidos",
          detalles: resultado.error.issues.map((problema) => ({
            campo: problema.path.join(".") || "(cuerpo)",
            mensaje: problema.message,
          })),
        },
      });
    }

    if (fuente === "query") {
      // Express 5 expone req.query como getter que se recalcula en cada
      // acceso: el resultado validado se guarda en req.queryValidada.
      req.queryValidada = resultado.data;
    } else {
      req[fuente] = resultado.data;
    }
    return next();
  };
}

module.exports = { validar };
