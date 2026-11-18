const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const config = require("../../config");
const ErrorApi = require("../../errores");
const { obtenerPool } = require("../../database/pool");
const repositorio = require("./auth.repository");

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

module.exports = { registrarEstudiante, iniciarSesion };
