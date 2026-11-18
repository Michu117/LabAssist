const crypto = require("node:crypto");

const ErrorApi = require("../../errores");
const { obtenerPool } = require("../../database/pool");
const repositorio = require("./biometria.repository");
const mqtt = require("../../services/mqtt.service");
const config = require("../../config");

function generarHex() {
  return crypto.randomBytes(32).toString("hex");
}

async function iniciarCaptura(usuarioId, dispositivoId = config.mqttDeviceId) {
  const id = generarHex();
  await repositorio.crearCaptura(obtenerPool(), {
    id,
    dispositivoId,
    creadaPor: usuarioId,
  });
  mqtt.publicarOrdenCaptura({ capturaId: id, dispositivoId });
  return { captura_id: id, estado: "PENDIENTE", dispositivo_id: dispositivoId };
}

async function consultarCaptura(id) {
  const captura = await repositorio.obtenerEstado(obtenerPool(), id);
  if (!captura) {
    throw new ErrorApi(404, "NO_ENCONTRADO", "Captura biométrica no encontrada");
  }
  return captura;
}

async function completarCapturaMQTT(datos) {
  const captura = await repositorio.completarCaptura(obtenerPool(), {
    id: datos.captura_id,
    plantilla: datos.plantilla,
    dispositivoId: datos.dispositivo_id,
  });
  if (!captura) {
    throw new ErrorApi(400, "CAPTURA_INVALIDA", "La captura no existe, expiró o ya fue utilizada");
  }
  return captura;
}

async function registrarResultadoMQTT(datos) {
  if (!datos.captura_id || !datos.dispositivo_id) return;
  if (datos.resultado !== "OK") {
    await repositorio.marcarCapturaError(obtenerPool(), {
      id: datos.captura_id,
      dispositivoId: datos.dispositivo_id,
      mensaje: datos.mensaje || "El sensor no pudo completar la captura",
    });
    return;
  }
  if (
    typeof datos.plantilla !== "string" ||
    datos.plantilla.length === 0 ||
    datos.plantilla.length > 100000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(datos.plantilla)
  ) {
    await repositorio.marcarCapturaError(obtenerPool(), {
      id: datos.captura_id,
      dispositivoId: datos.dispositivo_id,
      mensaje: "La plantilla recibida no tiene un formato Base64 válido",
    });
    return;
  }
  try {
    await completarCapturaMQTT(datos);
  } catch (error) {
    console.error("No se pudo guardar la captura MQTT:", error.message);
  }
}

function iniciarRecepcionMQTT() {
  mqtt.conectarMqtt(registrarResultadoMQTT);
}

module.exports = {
  iniciarCaptura,
  consultarCaptura,
  completarCapturaMQTT,
  iniciarRecepcionMQTT,
};
