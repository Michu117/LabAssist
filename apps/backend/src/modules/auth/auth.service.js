const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("node:crypto");
const config = require("../../config");
const ErrorApi = require("../../errores");
const { obtenerPool } = require("../../database/pool");
const repositorio = require("./auth.repository");
const { enviarCorreoRecuperacion } = require("../../services/gmail.service");
const COSTO_BCRYPT = 10;

async function registrarEstudiante(datos) {
  const pool = obtenerPool();
  const { nombre, apellido, cedula, correo, contrasena, carrera, ciclo } = datos;

  const [porCedula, porCorreo] = await Promise.all([
    repositorio.buscarPorCedula(pool, cedula),
    repositorio.buscarPorCorreo(pool, correo),
  ]);

  if (porCedula) {
    throw new ErrorApi(409, "CONFLICTO", "La cédula ya está registrada");
  }
  if (porCorreo) {
    throw new ErrorApi(409, "CONFLICTO", "El correo ya está registrado");
  }

  const hash = await bcrypt.hash(contrasena, COSTO_BCRYPT);

  let id;
  try {
    id = await repositorio.crearEstudiante(
      pool,
      { nombre, apellido, cedula, correo, carrera, ciclo },
      hash
    );
  } catch (error) {
    // 23505 = unique_violation: cubre la carrera entre la consulta y la
    // inserción.
    if (error.code === "23505") {
      throw new ErrorApi(
        409,
        "CONFLICTO",
        "La cédula o el correo ya están registrados"
      );
    }
    throw error;
  }

  return { id, nombre, apellido, cedula, correo, carrera, ciclo, tipo: "ESTUDIANTE" };
}

async function iniciarSesion({ correo, contrasena }) {
  const pool = obtenerPool();

  const cuenta = await repositorio.buscarCuentaPorCorreo(pool, correo);
  const coincide = cuenta
    ? await bcrypt.compare(contrasena, cuenta.clave)
    : false;

  if (!cuenta || !coincide) {
    throw new ErrorApi(401, "CREDENCIALES", "Credenciales de acceso inválidas");
  }

  const usuario = await repositorio.buscarUsuarioPorId(
    pool,
    cuenta.usuario_id
  );
  if (!usuario) {
    throw new ErrorApi(401, "CREDENCIALES", "Credenciales de acceso inválidas");
  }

  // En el token solo viajan el identificador y la expiración.
  const token = jwt.sign({ sub: String(usuario.id) }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });

  return {
    token,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      correo: usuario.correo,
      tipo: usuario.tipo,
    },
  };
}

const DURACION_TOKEN_MS = 15 * 60 * 1000;

function generarTokenRecuperacion() {
  return crypto.randomBytes(32).toString("hex");
}

function calcularHashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function solicitarRecuperacion({ correo }) {
  const pool = obtenerPool();

  const cuenta = await repositorio.buscarCuentaPorCorreo(pool, correo);

  // No revelamos si el correo existe en el sistema.
  if (!cuenta) {
    return {
      mensaje: "Si el correo está registrado, recibirás un enlace de recuperación.",
    };
  }

  const token = generarTokenRecuperacion();
  const tokenHash = calcularHashToken(token);

  await repositorio.guardarTokenRecuperacion(
    pool,
    cuenta.usuario_id,
    tokenHash
  );

  const enlace = new URL("/restablecer-contrasena", config.frontendUrl);
  enlace.searchParams.set("token", token);

  await enviarCorreoRecuperacion(correo, enlace.toString());

  return {
    mensaje: "Si el correo está registrado, recibirás un enlace de recuperación.",
  };
}

async function restablecerContrasena({ token, contrasena }) {
  const pool = obtenerPool();

  const tokenHash = calcularHashToken(token);

  const recuperacion = await repositorio.buscarTokenRecuperacion(
    pool,
    tokenHash
  );

  if (!recuperacion) {
    throw new ErrorApi(
      400,
      "TOKEN_INVALIDO",
      "El enlace de recuperación es inválido o ha expirado"
    );
  }

  const hashClave = await bcrypt.hash(contrasena, COSTO_BCRYPT);

  const actualizado = await repositorio.actualizarContrasenaConToken(
    pool,
    tokenHash,
    hashClave
  );

  if (!actualizado) {
    throw new ErrorApi(
      400,
      "TOKEN_INVALIDO",
      "El enlace de recuperación es inválido o ha expirado"
    );
  }

  return {
    mensaje: "Contraseña actualizada correctamente. Ya puedes iniciar sesión.",
  };
}

module.exports = {
  registrarEstudiante,
  iniciarSesion,
  solicitarRecuperacion,
  restablecerContrasena,
};