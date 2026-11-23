const { obtenerPool } = require("../../database/pool");
const ErrorApi = require("../../errores");
const repositorio = require("./sesiones.repository");

async function enTransaccion(operacion) {
  const db = await obtenerPool().connect();
  try {
    await db.query("BEGIN");
    const resultado = await operacion(db);
    await db.query("COMMIT");
    return resultado;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}

async function abrir(laboratorioId, actor) {
  try {
    return await enTransaccion(async (db) => {
      const laboratorio = await repositorio.bloquearLaboratorio(db, laboratorioId);
      if (!laboratorio) throw new ErrorApi(404, "LABORATORIO_NO_ENCONTRADO", "No se encontró el laboratorio");
      const { operativa, abierta, actividad_anterior } = await repositorio.revisarApertura(db, laboratorioId);
      if (abierta) throw yaAbierta();
      if (actividad_anterior) {
        throw new ErrorApi(409, "ACTIVIDAD_ANTERIOR", "El laboratorio tiene reservas programadas vigentes");
      }
      if (!operativa) throw new ErrorApi(409, "SIN_PC_OPERATIVA", "El laboratorio no tiene computadoras operativas");
      await cambiarHabilitacion(db, laboratorioId, true);
      const sesion = await repositorio.abrir(db, laboratorioId, actor);
      if (!sesion) throw cambioIncompleto();
      return sesion;
    });
  } catch (error) {
    if (error.code === "23505" && error.constraint === "sesion_practica_abierta_por_laboratorio") {
      throw yaAbierta();
    }
    throw error;
  }
}

function cambioIncompleto() {
  return new ErrorApi(500, "CAMBIO_SESION_INCOMPLETO", "No se pudo completar el cambio de estado del laboratorio");
}

async function cambiarHabilitacion(db, laboratorioId, habilitado) {
  if (!(await repositorio.cambiarHabilitacion(db, laboratorioId, habilitado))) throw cambioIncompleto();
}

function yaAbierta() {
  return new ErrorApi(409, "SESION_YA_ABIERTA", "El laboratorio ya tiene una sesión abierta");
}

function finalizar(laboratorioId, sesionId, actor, desocupado) {
  return enTransaccion(async (db) => {
    await repositorio.bloquearLaboratorio(db, laboratorioId);
    const sesion = await repositorio.bloquearSesion(db, laboratorioId, sesionId);
    if (!sesion) throw new ErrorApi(404, "SESION_NO_ENCONTRADA", "No se encontró la sesión del laboratorio");
    if (sesion.estado !== "ABIERTA") throw new ErrorApi(409, "SESION_FINALIZADA", "La sesión ya finalizó");
    if (!desocupado && await repositorio.tieneOcupaciones(db, sesionId)) {
      throw new ErrorApi(409, "CONFIRMAR_LABORATORIO_DESOCUPADO", "Confirma que el laboratorio está desocupado");
    }
    await cambiarHabilitacion(db, laboratorioId, false);
    const cerrada = await repositorio.finalizar(db, sesionId, actor);
    if (!cerrada) throw cambioIncompleto();
    return cerrada;
  });
}

module.exports = { abrir, finalizar, enTransaccion };
