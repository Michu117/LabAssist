const bcrypt = require("bcrypt");

const ErrorApi = require("../../errores");
const { obtenerPool } = require("../../database/pool");
const {
  buscarPorCedula,
  buscarPorCorreo,
} = require("../auth/auth.repository");
const repositorio = require("./usuarios.repository");

const COSTO_BCRYPT = 10;

function aPerfilPublico(usuario) {
  const publico = {
    id: usuario.id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    cedula: usuario.cedula,
    correo: usuario.correo,
    tipo: usuario.tipo,
  };
  if (usuario.tipo === "ESTUDIANTE") {
    publico.carrera = usuario.carrera;
    publico.ciclo = usuario.ciclo;
  }
  return publico;
}

async function obtenerPerfil(id) {
  const usuario = await repositorio.buscarPorId(obtenerPool(), id);
  if (!usuario) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "Usuario no encontrado");
  }
  return aPerfilPublico(usuario);
}

async function editarPerfil(id, datos) {
  const pool = obtenerPool();
  const actual = await repositorio.buscarPorId(pool, id);
  if (!actual) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "Usuario no encontrado");
  }

  const esEstudiante = actual.tipo === "ESTUDIANTE";
  const quiereCarrera = "carrera" in datos || "ciclo" in datos;
  if (quiereCarrera && !esEstudiante) {
    throw new ErrorApi(400, "VALIDACION", "Los datos enviados no son válidos", [
      { campo: "carrera", mensaje: "Solo los estudiantes tienen carrera y ciclo" },
    ]);
  }

  const actualizado = {
    ...actual,
    nombre: datos.nombre ?? actual.nombre,
    apellido: datos.apellido ?? actual.apellido,
    carrera: datos.carrera ?? actual.carrera,
    ciclo: datos.ciclo ?? actual.ciclo,
  };

  await repositorio.actualizarPerfil(pool, id, {
    nombre: actualizado.nombre,
    apellido: actualizado.apellido,
    carrera: esEstudiante ? actualizado.carrera : undefined,
    ciclo: esEstudiante ? actualizado.ciclo : undefined,
  });

  return aPerfilPublico(actualizado);
}

async function cambiarContrasena(id, datos) {
  const pool = obtenerPool();

  const cuenta = await repositorio.buscarCuentaPorUsuario(pool, id);
  if (!cuenta || !(await bcrypt.compare(datos.contrasena_actual, cuenta.clave))) {
    throw new ErrorApi(401, "CREDENCIALES", "La contraseña actual es incorrecta");
  }

  const hash = await bcrypt.hash(datos.contrasena, COSTO_BCRYPT);
  await repositorio.actualizarClave(pool, id, hash);
}

async function listarUsuarios(filtros) {
  const pool = obtenerPool();
  const { pagina, limite, tipo, busqueda } = filtros;

  const filas = await repositorio.listar(pool, {
    limite,
    offset: (pagina - 1) * limite,
    tipo,
    busqueda,
  });

  return {
    usuarios: filas.map(aPerfilPublico),
    total: filas[0] ? filas[0].total : 0,
    pagina,
    limite,
  };
}

async function crearTecnico(datos) {
  const pool = obtenerPool();
  const { nombre, apellido, cedula, correo, contrasena } = datos;

  const porCedula = await buscarPorCedula(pool, cedula);
  if (porCedula) {
    throw new ErrorApi(409, "CONFLICTO", "La cédula ya está registrada");
  }
  const porCorreo = await buscarPorCorreo(pool, correo);
  if (porCorreo) {
    throw new ErrorApi(409, "CONFLICTO", "El correo ya está registrado");
  }

  const hash = await bcrypt.hash(contrasena, COSTO_BCRYPT);

  let id;
  try {
    id = await repositorio.crearTecnico(
      pool,
      { nombre, apellido, cedula, correo },
      hash
    );
  } catch (error) {
    if (error.code === "23505") {
      throw new ErrorApi(
        409,
        "CONFLICTO",
        "La cédula o el correo ya están registrados"
      );
    }
    throw error;
  }

  return aPerfilPublico(await repositorio.buscarPorId(pool, id));
}

async function editarUsuario(id, datos) {
  const pool = obtenerPool();
  const actual = await repositorio.buscarPorId(pool, id);
  if (!actual) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "Usuario no encontrado");
  }

  const esEstudiante = actual.tipo === "ESTUDIANTE";
  const quiereCarrera = "carrera" in datos || "ciclo" in datos;
  if (quiereCarrera && !esEstudiante) {
    throw new ErrorApi(400, "VALIDACION", "Los datos enviados no son válidos", [
      { campo: "carrera", mensaje: "Solo los estudiantes tienen carrera y ciclo" },
    ]);
  }

  if (datos.cedula) {
    const duplicada = await buscarPorCedula(pool, datos.cedula);
    if (duplicada && duplicada.id !== id) {
      throw new ErrorApi(409, "CONFLICTO", "La cédula ya está registrada");
    }
  }
  if (datos.correo) {
    const duplicado = await buscarPorCorreo(pool, datos.correo);
    if (duplicado && duplicado.id !== id) {
      throw new ErrorApi(409, "CONFLICTO", "El correo ya está registrado");
    }
  }

  const actualizado = {
    ...actual,
    nombre: datos.nombre ?? actual.nombre,
    apellido: datos.apellido ?? actual.apellido,
    cedula: datos.cedula ?? actual.cedula,
    correo: datos.correo ?? actual.correo,
    carrera: datos.carrera ?? actual.carrera,
    ciclo: datos.ciclo ?? actual.ciclo,
  };

  await repositorio.actualizarUsuario(pool, id, {
    nombre: actualizado.nombre,
    apellido: actualizado.apellido,
    cedula: actualizado.cedula,
    correo: actualizado.correo,
    carrera: esEstudiante ? actualizado.carrera : undefined,
    ciclo: esEstudiante ? actualizado.ciclo : undefined,
  });

  return aPerfilPublico(actualizado);
}

async function eliminarUsuario(idPropio, idObjetivo) {
  if (idPropio === idObjetivo) {
    throw new ErrorApi(409, "CONFLICTO", "No puedes eliminar tu propia cuenta");
  }

  const pool = obtenerPool();
  const existe = await repositorio.buscarPorId(pool, idObjetivo);
  if (!existe) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "Usuario no encontrado");
  }

  await repositorio.eliminar(pool, idObjetivo);
}

module.exports = {
  obtenerPerfil,
  editarPerfil,
  cambiarContrasena,
  listarUsuarios,
  crearTecnico,
  editarUsuario,
  eliminarUsuario,
};
