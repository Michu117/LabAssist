const mqtt = require("mqtt");

const config = require("../config");

let cliente;
let conectado = false;
const pendientes = [];

function publicar(topic, mensaje) {
  const contenido = JSON.stringify(mensaje);
  if (!conectado) {
    pendientes.push({ topic, contenido });
    return;
  }
  cliente.publish(topic, contenido, { qos: 1 }, (error) => {
    if (error) console.error("Error publicando MQTT:", error.message);
  });
}

function vaciarPendientes() {
  while (conectado && pendientes.length > 0) {
    const pendiente = pendientes.shift();
    publicar(pendiente.topic, JSON.parse(pendiente.contenido));
  }
}

function conectarMqtt(alRecibirResultado) {
  cliente = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
    reconnectPeriod: 5000,
    clientId: `labassist-backend-${Math.random().toString(16).slice(2)}`,
  });

  cliente.on("connect", () => {
    conectado = true;
    cliente.subscribe(config.mqttResultTopic, { qos: 1 }, (error) => {
      if (error) console.error("Error suscribiendo MQTT:", error.message);
    });
    vaciarPendientes();
    console.log(`MQTT conectado a ${config.mqttUrl}`);
  });

  cliente.on("reconnect", () => {
    conectado = false;
  });

  cliente.on("close", () => {
    conectado = false;
  });

  cliente.on("error", (error) => {
    console.error("Error MQTT:", error.message);
  });

  cliente.on("message", (topic, mensaje) => {
    if (topic !== config.mqttResultTopic) return;
    try {
      alRecibirResultado(JSON.parse(mensaje.toString()));
    } catch (error) {
      console.error("Mensaje MQTT inválido:", error.message);
    }
  });
}

function publicarOrdenCaptura(datos) {
  publicar(config.mqttCommandTopic, {
    operacion: "ENROLAR",
    dispositivo_id: datos.dispositivoId,
    captura_id: datos.capturaId,
    intentos: 2,
  });
}

module.exports = { conectarMqtt, publicarOrdenCaptura };
