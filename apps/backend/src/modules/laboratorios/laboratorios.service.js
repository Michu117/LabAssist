const { obtenerPool } = require("../../database/pool");
const ErrorApi = require("../../errores");
const repositorio = require("./laboratorios.repository");

function listar() {
  return repositorio.listar(obtenerPool());
}

async function consultarComputadoras(laboratorioId) {
  const resultado = await repositorio.consultarComputadoras(obtenerPool(), laboratorioId);
  if (!resultado) throw new ErrorApi(404, "LABORATORIO_NO_ENCONTRADO", "No se encontró el laboratorio");
  const { computadoras, ...laboratorio } = resultado;
  return { laboratorio, computadoras };
}

async function crear({ codigo, nombre, cantidad_computadoras: cantidad }) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    const laboratorio = await repositorio.insertarLaboratorio(cliente, codigo, nombre);
    const creadas = await repositorio.generarComputadoras(cliente, laboratorio.id, cantidad);
    if (creadas !== cantidad) {
      throw new ErrorApi(500, "INVENTARIO_INCOMPLETO", "No se pudieron registrar todas las computadoras");
    }
    await cliente.query("COMMIT");
    return { ...laboratorio, cantidad_computadoras: creadas };
  } catch (error) {
    await cliente.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "laboratorio_codigo_uk") {
      throw new ErrorApi(409, "CODIGO_DUPLICADO", "Ya existe un laboratorio con ese código");
    }
    throw error;
  } finally {
    cliente.release();
  }
}

function listarLectores() {
  return repositorio.listarLectores(obtenerPool());
}

async function crearLector({ id, capacidad, laboratorio_id: laboratorioId }) {
  try {
    return await repositorio.insertarLector(obtenerPool(), id, capacidad, laboratorioId);
  } catch (error) {
    if (error.code === "23505") {
      throw new ErrorApi(409, "LECTOR_DUPLICADO", "Ya existe un lector con ese identificador");
    }
    if (error.code === "23503") {
      throw new ErrorApi(404, "LABORATORIO_NO_ENCONTRADO", "No se encontró el laboratorio");
    }
    throw error;
  }
}

async function asignarLector(id, laboratorioId) {
  try {
    const lector = await repositorio.asignarLector(obtenerPool(), id, laboratorioId);
    if (!lector) throw new ErrorApi(404, "LECTOR_NO_ENCONTRADO", "No se encontró el lector");
    return lector;
  } catch (error) {
    if (error.code === "23503") {
      throw new ErrorApi(404, "LABORATORIO_NO_ENCONTRADO", "No se encontró el laboratorio");
    }
    throw error;
  }
}

module.exports = { listar, consultarComputadoras, crear, listarLectores, crearLector, asignarLector };
