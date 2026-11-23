const { obtenerPool } = require("../../database/pool");
const ErrorApi = require("../../errores");
const repositorio = require("./ocupacion.repository");
const sesiones = require("../sesiones/sesiones.service");
const { lectoresConfigurados } = require("../../services/mqtt.service");

function listarLaboratorios() {
  return repositorio.listarLaboratorios(obtenerPool());
}

async function consultarPlano(laboratorioId) {
  const plano = await repositorio.consultarPlano(obtenerPool(), laboratorioId, lectoresConfigurados());
  if (!plano) throw new ErrorApi(404, "LABORATORIO_NO_ENCONTRADO", "No se encontró el laboratorio");

  const { id, nombre, ubicacion, habilitado, sesion, computadoras, presentes, porcentaje_ocupacion,
    asistencia_integrada, ...conteos } = plano;
  return {
    laboratorio: { id, nombre, ubicacion, habilitado },
    sesion,
    computadoras,
    asistencia_integrada,
    estadisticas: {
      ...conteos,
      presentes: asistencia_integrada ? presentes : null,
      porcentaje_ocupacion: asistencia_integrada ? porcentaje_ocupacion : null,
    },
  };
}

async function consultarOcupante(laboratorioId, computadoraId) {
  const ocupante = await repositorio.consultarOcupante(obtenerPool(), laboratorioId, computadoraId);
  if (!ocupante) {
    throw new ErrorApi(404, "PC_NO_ENCONTRADA", "No se encontró la computadora en el laboratorio");
  }
  if (!ocupante.ingreso_en) {
    throw new ErrorApi(409, "PC_SIN_OCUPANTE", "La computadora no tiene una ocupación confirmada");
  }
  return ocupante;
}

module.exports = {
  listarLaboratorios, consultarPlano, consultarOcupante,
  abrirSesion: sesiones.abrir, finalizarSesion: sesiones.finalizar,
};
