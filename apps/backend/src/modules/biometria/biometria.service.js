const crypto = require("node:crypto");
const { z } = require("zod");
const ErrorApi = require("../../errores");
const { obtenerPool } = require("../../database/pool");
const { enTransaccion } = require("../sesiones/sesiones.service");
const { confirmarAsistenciaVerificada } = require("../reservas/reservas.asistencia.service");
const repo = require("./biometria.repository");
const mqtt = require("../../services/mqtt.service");
const config = require("../../config");

const generarId = () => crypto.randomBytes(32).toString("hex");
const presencia = new Map();
const idHex = z.string().regex(/^[a-f0-9]{64}$/);
const slotValido = z.number().int().min(1).max(65535);
const idEvento = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);
const dispositivo_id = z.string();
const estado = z.strictObject({
  operacion: z.literal("ESTADO"), dispositivo_id,
  emitido_en: z.number().int(), listo: z.boolean(), slots_ocupados: z.array(slotValido).max(65535),
});
const captura = z.strictObject({
  operacion: z.literal("RESULTADO_ENROLAR"), dispositivo_id,
  captura_id: idHex, slot: slotValido, resultado: z.enum(["OK", "ERROR"]),
  plantilla: z.string().min(4).max(100000).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
  codigo: z.enum(["SLOT_OCUPADO", "HUELLA_DUPLICADA", "SENSOR_OCUPADO", "CAPTURA_FALLIDA"]).optional(),
}).refine((dato) => dato.resultado === "OK"
  ? Boolean(dato.plantilla && dato.plantilla.length % 4 === 0 && !dato.codigo)
  : Boolean(dato.codigo && !dato.plantilla));
const identificacion = z.strictObject({
  operacion: z.literal("IDENTIFICACION"), dispositivo_id,
  evento_id: idEvento, modo_id: idHex, slot: slotValido,
});
const mensajes = {
  SLOT_OCUPADO: "El slot ya contiene una huella",
  HUELLA_DUPLICADA: "El lector ya tiene registrada esta huella",
  SENSOR_OCUPADO: "El lector está ocupado",
  CAPTURA_FALLIDA: "El sensor no pudo completar la captura",
};

function noDisponible() {
  return new ErrorApi(503, "LECTOR_NO_DISPONIBLE", "El lector biométrico no está disponible");
}

async function comprobarLector(db, id) {
  if (!mqtt.conectado() || !mqtt.tieneClave(id)) throw noDisponible();
  const lector = await repo.lector(db, id);
  const actual = presencia.get(id);
  const ahora = Date.now();
  if (!lector || !actual?.listo || ahora - Math.min(actual.emitido_en, actual.recibido_en) > 15000) {
    throw noDisponible();
  }
  return { lector, ocupados: actual.slots_ocupados };
}

async function iniciarCaptura(actor, id = config.mqttDeviceId) {
  const solicitud = await enTransaccion(async (db) => {
    const { lector, ocupados } = await comprobarLector(db, id);
    const { rowCount } = await db.query(
      "SELECT 1 FROM biometria_captura WHERE dispositivo_id = $1 AND estado = 'PENDIENTE' AND expira_en > statement_timestamp()",
      [id]
    );
    if (rowCount) throw new ErrorApi(409, "LECTOR_OCUPADO", "Ya hay una captura pendiente para el lector");
    const fila = await repo.crearCaptura(db, generarId(), lector, actor, ocupados);
    if (!fila) throw new ErrorApi(409, "SIN_SLOTS", "No hay slots disponibles para registrar huellas");
    return fila;
  });
  try {
    await mqtt.publicar(id, "comandos", {
      operacion: "ENROLAR", captura_id: solicitud.captura_id,
      slot: solicitud.slot, vence_en: solicitud.expira_en.toISOString(),
    });
  } catch {
    await repo.resolverCaptura(obtenerPool(), { ...solicitud, mensaje: "No se pudo entregar la orden MQTT" });
    throw noDisponible();
  }
  return solicitud;
}

async function consultarCaptura(id, actor) {
  const fila = await repo.obtenerEstado(obtenerPool(), id, actor);
  if (!fila) throw new ErrorApi(404, "NO_ENCONTRADO", "Captura biométrica no encontrada");
  return fila;
}

async function iniciarIdentificacion(id = config.mqttDeviceId) {
  const modo = await enTransaccion(async (db) => {
    const { lector } = await comprobarLector(db, id);
    const fila = await repo.crearModo(db, generarId(), lector);
    if (!fila) throw new ErrorApi(409, "SESION_CERRADA", "No hay una sesión abierta con plazo vigente para el lector");
    return fila;
  });
  try {
    await mqtt.publicar(id, "comandos", {
      operacion: "IDENTIFICAR", modo_id: modo.modo_id, vence_en: modo.vence_en.toISOString(),
    });
  } catch {
    await obtenerPool().query("DELETE FROM biometria_modo WHERE id = $1", [modo.modo_id]);
    throw noDisponible();
  }
  return { ...modo, dispositivo_id: id };
}

async function responderIdentificacion(id, evento) {
  const respuesta = await enTransaccion(async (db) => {
    const lector = await repo.lector(db, id);
    if (!lector) return null;
    const base = { operacion: "RESULTADO_ASISTENCIA", evento_id: evento.evento_id, modo_id: evento.modo_id };
    const rechazar = (codigo) => ({ ...base, resultado: "RECHAZADA", codigo });
    const previa = await repo.obtenerRespuesta(db, id, evento.evento_id);
    if (previa) {
      return previa.modo_id === evento.modo_id && previa.slot === evento.slot
        ? previa.respuesta : rechazar("EVENTO_EN_CONFLICTO");
    }

    let salida;
    try {
      const reserva = await repo.buscarReserva(db, lector, evento);
      if (!reserva) throw new ErrorApi(409, "MODO_NO_VIGENTE");
      if (!reserva.estudiante_id || evento.slot > lector.capacidad) throw new ErrorApi(404, "HUELLA_NO_REGISTRADA");
      if (!reserva.reserva_id) throw new ErrorApi(404, "RESERVA_NO_ENCONTRADA");
      const asistencia = await confirmarAsistenciaVerificada({
        estudianteId: reserva.estudiante_id, sesionId: reserva.sesion_id, reservaId: reserva.reserva_id,
      }, db);
      salida = { ...base, resultado: "AUTORIZADA", asistencia_en: asistencia.asistencia_confirmada_en.toISOString() };
    } catch (error) {
      if (!(error instanceof ErrorApi) || error.status >= 500) throw error;
      salida = rechazar(error.codigo);
    }
    await repo.guardarRespuesta(db, id, evento, salida);
    return salida;
  });
  if (!respuesta) {
    console.warn("Asistencia biométrica descartada:", id, "LECTOR_NO_PROVISIONADO_O_INACTIVO");
    return;
  }
  await mqtt.publicar(id, "respuestas", respuesta);
  console.info("Respuesta de asistencia publicada:", id, respuesta.resultado, respuesta.codigo ?? "");
}

async function procesarEvento(id, datos) {
  if (datos.operacion === "ESTADO") {
    const evento = estado.safeParse(datos);
    if (evento.success && Math.abs(Date.now() - evento.data.emitido_en) <= 15000
      && evento.data.emitido_en > (presencia.get(id)?.emitido_en ?? 0)) {
      presencia.set(id, { ...evento.data, recibido_en: Date.now() });
    }
  }
  if (datos.operacion === "RESULTADO_ENROLAR") {
    const evento = captura.safeParse(datos);
    if (!evento.success) return;
    const { captura_id, slot, codigo } = evento.data;
    const aceptado = await enTransaccion(async (db) => {
      if (!await repo.lector(db, id)) return false;
      await repo.resolverCaptura(db, { ...evento.data, mensaje: mensajes[codigo] });
      return repo.comprobarResultado(db, evento.data, mensajes[codigo]);
    });
    await mqtt.publicar(id, "respuestas", {
      operacion: "ACUSE_ENROLAR", captura_id, slot, resultado: aceptado ? "ACEPTADO" : "RECHAZADO",
      ...(aceptado ? {} : { codigo: "CAPTURA_NO_VIGENTE_O_EN_CONFLICTO" }),
    });
  }
  if (datos.operacion === "IDENTIFICACION") {
    const evento = identificacion.safeParse(datos);
    if (!evento.success) {
      console.warn("Identificación biométrica descartada:", id, "FORMATO_INVALIDO");
      return;
    }
    await responderIdentificacion(id, evento.data);
  }
}

function iniciarRecepcionMQTT() {
  const cliente = mqtt.conectarMqtt(procesarEvento);
  cliente.on("close", () => presencia.clear());
  return cliente;
}

module.exports = { iniciarCaptura, consultarCaptura, iniciarIdentificacion, iniciarRecepcionMQTT };
