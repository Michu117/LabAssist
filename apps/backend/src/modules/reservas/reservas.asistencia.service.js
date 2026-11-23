const ErrorApi = require("../../errores");
const { enTransaccion } = require("../sesiones/sesiones.service");
const repositorio = require("./reservas.repository");

// Solo para un adaptador interno que haya verificado la identidad en el sensor.
// El adaptador de asistencia autentica al lector y resuelve la identidad antes de invocar este servicio.
function confirmarAsistenciaVerificada({ estudianteId, sesionId, reservaId }, transaccion) {
  async function confirmar(db) {
    const sesion = await repositorio.buscarSesion(db, sesionId, true);
    if (!sesion) throw new ErrorApi(409, "SESION_CERRADA", "La sesión no está abierta");

    const { rows: [referencia] } = await db.query(
      "SELECT computadora_id FROM reserva WHERE id = $1 AND sesion_id = $2 AND estudiante_id = $3",
      [reservaId, sesionId, estudianteId]
    );
    if (!referencia) throw new ErrorApi(404, "RESERVA_NO_ENCONTRADA", "No se encontró una reserva para la identidad verificada");

    const pc = await repositorio.bloquearComputadora(db, referencia.computadora_id, sesion.laboratorio_id);
    if (pc?.estado_fisico !== "NORMAL") throw new ErrorApi(409, "PC_NO_OPERATIVA", "La computadora no está operativa");

    const { rows: [reserva] } = await db.query(
      `SELECT id, asistencia_confirmada_en
         FROM reserva
        WHERE id = $1 AND expirada_en IS NULL
          AND cancelada_por_cierre_en IS NULL AND ocupacion_finalizada_en IS NULL
        FOR UPDATE`,
      [reservaId]
    );
    if (reserva?.asistencia_confirmada_en) return reserva;

    const { rows: [confirmada] } = await db.query(
      `WITH reloj AS MATERIALIZED (SELECT clock_timestamp() AS ahora)
       UPDATE reserva r SET asistencia_confirmada_en = reloj.ahora FROM reloj
        WHERE r.id = $1 AND r.asistencia_confirmada_en IS NULL AND r.vence_en > reloj.ahora
          AND r.expirada_en IS NULL AND r.cancelada_por_cierre_en IS NULL AND r.ocupacion_finalizada_en IS NULL
        RETURNING r.id, r.asistencia_confirmada_en`,
      [reservaId]
    );
    if (!confirmada) throw new ErrorApi(409, "RESERVA_NO_VIGENTE", "La reserva ya no está vigente");
    return confirmada;
  }
  return transaccion ? confirmar(transaccion) : enTransaccion(confirmar);
}

module.exports = { confirmarAsistenciaVerificada };
