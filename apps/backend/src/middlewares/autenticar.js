const jwt = require("jsonwebtoken");

const config = require("../config");
const ErrorApi = require("../errores");
const { obtenerPool } = require("../database/pool");
const { buscarUsuarioPorId } = require("../modules/auth/auth.repository");

// Verifica el JWT y consulta en la base de datos que el usuario exista y su
// tipo; así, un usuario eliminado pierde el acceso de inmediato.
async function autenticar(req, res, next) {
  const [esquema, token] = (req.headers.authorization || "").split(" ");

  if (esquema !== "Bearer" || !token) {
    return next(
      new ErrorApi(401, "AUTENTICACION", "Se requiere un token de acceso válido")
    );
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    return next(
      new ErrorApi(401, "AUTENTICACION", "Se requiere un token de acceso válido")
    );
  }

  try {
    const usuario = await buscarUsuarioPorId(obtenerPool(), Number(payload.sub));
    if (!usuario) {
      return next(
        new ErrorApi(401, "AUTENTICACION", "Se requiere un token de acceso válido")
      );
    }
    req.usuario = usuario;
    return next();
  } catch (error) {
    return next(error);
  }
}

function soloTecnicoDocente(req, res, next) {
  if (!req.usuario || req.usuario.tipo !== "TECNICO_DOCENTE") {
    return next(
      new ErrorApi(403, "PROHIBIDO", "No tienes permiso para realizar esta acción")
    );
  }
  return next();
}

module.exports = { autenticar, soloTecnicoDocente };
