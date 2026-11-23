const crypto = require("node:crypto");
const mqtt = require("mqtt");
const config = require("../config");

const prefijo = "labassist/biometria";
const claves = new Map(Object.entries(JSON.parse(process.env.BIOMETRIA_CLAVES_JSON || "{}")));
for (const [id, clave] of claves) {
  if (!/^[\w-]{1,100}$/.test(id) || typeof clave !== "string" || !/^[a-f0-9]{64}$/.test(clave)) {
    throw new Error("Configuración inválida de claves biométricas");
  }
}
if (new Set(claves.values()).size !== claves.size) throw new Error("Cada lector requiere una clave distinta");

let cliente;
let suscrito = false;
const ultimosDescartes = new Map();
const conectado = () => Boolean(cliente?.connected && suscrito);
const firma = (topic, datos, clave) =>
  crypto.createHmac("sha256", Buffer.from(clave, "hex")).update(topic + "\n" + datos).digest();

function descartar(motivo) {
  const ahora = Date.now();
  if (ahora - (ultimosDescartes.get(motivo) ?? 0) < 30_000) return;
  ultimosDescartes.set(motivo, ahora);
  console.warn("Evento MQTT biométrico descartado:", motivo);
}

function conectarMqtt(procesar) {
  cliente = mqtt.connect(config.mqttUrl, {
    username: config.mqttUsername || undefined,
    password: config.mqttPassword || undefined,
    reconnectPeriod: 5000,
  });
  cliente.on("connect", () => {
    cliente.subscribe(`${prefijo}/+/eventos`, { qos: 1 }, (error, reglas) => {
      suscrito = !error && reglas?.[0]?.qos === 1;
      if (suscrito) console.info("MQTT biométrico suscrito:", `${prefijo}/+/eventos`);
      else console.warn("MQTT biométrico: suscripción no confirmada con QoS 1");
    });
  });
  cliente.on("close", () => { suscrito = false; });
  cliente.on("error", (error) => console.error("Error MQTT biométrico:", error.message));
  cliente.on("message", async (topic, mensaje, paquete) => {
    const id = topic.split("/")[2];
    const clave = claves.get(id);
    if (topic !== `${prefijo}/${id}/eventos`) return;
    if (!clave) return descartar("LECTOR_SIN_CLAVE");
    if (paquete.retain) return descartar("MENSAJE_RETENIDO");
    if (mensaje.length > 140000) return descartar("TAMANO_INVALIDO");
    try {
      const sobre = JSON.parse(mensaje.toString("utf8"));
      if (typeof sobre?.datos !== "string" || typeof sobre.firma !== "string" || !/^[a-f0-9]{64}$/.test(sobre.firma)) {
        return descartar("SOBRE_INVALIDO");
      }
      if (!crypto.timingSafeEqual(firma(topic, sobre.datos, clave), Buffer.from(sobre.firma, "hex"))) {
        return descartar("FIRMA_INVALIDA");
      }
      const datos = JSON.parse(sobre.datos);
      if (datos?.dispositivo_id !== id) return descartar("LECTOR_NO_COINCIDE");
      await procesar(id, datos);
    } catch (error) {
      console.error("No se pudo procesar el evento biométrico:", error.code || error.name);
    }
  });
  return cliente;
}

async function publicar(id, canal, mensaje) {
  const clave = claves.get(id);
  if (!clave || !conectado()) throw new Error("MQTT biométrico no disponible");
  const topic = `${prefijo}/${id}/${canal}`;
  const datos = JSON.stringify({ ...mensaje, dispositivo_id: id });
  const sobre = JSON.stringify({ datos, firma: firma(topic, datos, clave).toString("hex") });
  let plazo;
  try {
    await Promise.race([
      cliente.publishAsync(topic, sobre, { qos: 1, retain: false }),
      new Promise((_, rechazar) => {
        plazo = setTimeout(() => rechazar(new Error("MQTT no confirmó la publicación a tiempo")), 5000);
      }),
    ]);
  } finally {
    clearTimeout(plazo);
  }
}

module.exports = {
  conectarMqtt, publicar, conectado, tieneClave: (id) => claves.has(id),
  lectoresConfigurados: () => [...claves.keys()],
};
