const { obtenerPool } = require("../../database/pool");
const ErrorApi = require("../../errores");
const repositorio = require("./reservas.repository");

async function sesionAbierta(db, sesionId, bloquear) {
  const sesion = await repositorio.buscarSesion(db, sesionId, bloquear);
  if (!sesion) {
    throw new ErrorApi(404, "SESION_NO_ENCONTRADA", "No se encontró la sesión práctica");
  }
  return sesion;
}

function sesionCerrada() {
  return new ErrorApi(409, "SESION_CERRADA", "El plazo para reservar en esta sesión terminó");
}

function pcNoDisponible() {
  return new ErrorApi(409, "PC_NO_DISPONIBLE", "La computadora ya no está disponible");
}

function reservaActivaExistente() {
  return new ErrorApi(409, "RESERVA_ACTIVA", "Ya tienes una reserva activa");
}

function listarSesiones() {
  return repositorio.listarSesiones(obtenerPool());
}

async function listarComputadoras(sesionId) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    await sesionAbierta(cliente, sesionId);
    const computadoras = await repositorio.listarComputadoras(cliente, sesionId);
    await cliente.query("COMMIT");
    return computadoras;
  } catch (error) {
    await cliente.query("ROLLBACK");
    throw error;
  } finally {
    cliente.release();
  }
}

function buscarActiva(estudianteId) {
  return repositorio.buscarActiva(obtenerPool(), estudianteId);
}

async function reservar(estudianteId, { sesionId, computadoraId }) {
  const cliente = await obtenerPool().connect();
  try {
    await cliente.query("BEGIN");
    if (!(await repositorio.bloquearCuenta(cliente, estudianteId))) {
      throw new ErrorApi(401, "AUTENTICACION", "Se requiere una cuenta válida");
    }

    const sesion = await sesionAbierta(cliente, sesionId, true);
    if (!sesion.admite_reservas) throw sesionCerrada();
    const pc = await repositorio.bloquearComputadora(cliente, computadoraId, sesion.laboratorio_id);
    if (!pc) {
      throw new ErrorApi(404, "PC_NO_ENCONTRADA", "No se encontró la computadora en el laboratorio");
    }

    await repositorio.expirar(cliente, estudianteId, computadoraId);
    const activa = await repositorio.buscarActiva(cliente, estudianteId, false);
    if (activa) {
      if (activa.sesion_id !== sesionId || activa.computadora_id !== computadoraId) {
        throw reservaActivaExistente();
      }
      await cliente.query("COMMIT");
      return { reserva: activa, creada: false };
    }

    if (pc.estado_fisico !== "NORMAL") throw pcNoDisponible();
    await repositorio.registrarVinculo(cliente, estudianteId, sesionId);
    const reserva = await repositorio.insertar(cliente, estudianteId, sesionId, computadoraId);
    if (!reserva) throw sesionCerrada();
    await cliente.query("COMMIT");
    return { reserva, creada: true };
  } catch (error) {
    await cliente.query("ROLLBACK");
    if (error.code === "23505" && error.constraint === "reserva_pc_vigente") {
      throw pcNoDisponible();
    }
    if (error.code === "23505" && error.constraint === "reserva_estudiante_vigente") {
      throw reservaActivaExistente();
    }
    throw error;
  } finally {
    cliente.release();
  }
}

module.exports = { listarSesiones, listarComputadoras, buscarActiva, reservar };
