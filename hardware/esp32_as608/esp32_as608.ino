/*
 * LabAssist: ESP32 + AS608 + MQTT.
 *
 * Librerias Arduino:
 * - Adafruit Fingerprint Sensor Library
 * - PubSubClient
 *
 * El backend publica una orden ENROLAR. La ESP32 captura dos imagenes,
 * crea el modelo, lo carga desde el slot y ejecuta UPLOAD para leer los
 * bytes reales de la plantilla. La plantilla se envia en Base64 por MQTT.
 */

#include <Adafruit_Fingerprint.h>
#include <PubSubClient.h>
#include <WiFi.h>

const char *WIFI_SSID = "CAMBIAR_WIFI";
const char *WIFI_PASSWORD = "CAMBIAR_CLAVE";
const char *MQTT_HOST = "192.168.1.100"; // IP del computador con Docker
const uint16_t MQTT_PORT = 1883;
const char *MQTT_USER = ""; // Configurar en produccion
const char *MQTT_PASSWORD = "";
const char *DISPOSITIVO_ID = "esp32-as608-01";
const char *TOPIC_COMANDOS = "labassist/biometria/comandos";
const char *TOPIC_RESULTADOS = "labassist/biometria/resultados";

// UART2: RX de la ESP32 recibe el TX del AS608; TX de la ESP32 envia al RX.
const int PIN_AS608_TX_ESP32_RX = 27;
const int PIN_AS608_RX_ESP32_TX = 26;
const uint32_t BAUD_SENSOR_PRIMARIO = 57600;
const uint32_t BAUD_SENSOR_ALTERNATIVO = 9600;
const uint32_t BAUD_SENSOR_TERCERO = 115200;
const uint32_t BAUD_SENSOR_CUARTO = 19200;

HardwareSerial sensorSerial(2);
Adafruit_Fingerprint sensor(&sensorSerial);
WiFiClient red;
PubSubClient mqtt(red);

const uint16_t SLOT_HUELLA = 1;
const char BASE64[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
String ordenPendiente;
bool hayOrdenPendiente = false;

String extraerCampo(const String &json, const char *campo) {
  String buscado = String("\"") + campo + "\":\"";
  int inicio = json.indexOf(buscado);
  if (inicio < 0) return "";
  inicio += buscado.length();
  int fin = json.indexOf('"', inicio);
  return fin < 0 ? "" : json.substring(inicio, fin);
}

void esperarHuellaAusente() {
  while (sensor.getImage() != FINGERPRINT_NOFINGER) {
    mqtt.loop();
    delay(100);
  }
}

bool enrolar(uint16_t slot) {
  int resultado;
  Serial.println("Coloca el dedo...");
  while ((resultado = sensor.getImage()) != FINGERPRINT_OK) {
    if (resultado != FINGERPRINT_NOFINGER) return false;
    mqtt.loop();
    delay(100);
  }
  if (sensor.image2Tz(1) != FINGERPRINT_OK) return false;

  Serial.println("Retira el dedo...");
  esperarHuellaAusente();
  Serial.println("Coloca el mismo dedo otra vez...");
  while ((resultado = sensor.getImage()) != FINGERPRINT_OK) {
    if (resultado != FINGERPRINT_NOFINGER) return false;
    mqtt.loop();
    delay(100);
  }
  if (sensor.image2Tz(2) != FINGERPRINT_OK) return false;
  if (sensor.createModel() != FINGERPRINT_OK) return false;
  return sensor.storeModel(slot) == FINGERPRINT_OK;
}

bool leerExacto(uint8_t *destino, size_t cantidad, uint32_t limite) {
  size_t leidos = 0;
  uint32_t inicio = millis();
  while (leidos < cantidad && millis() - inicio < limite) {
    if (sensorSerial.available()) destino[leidos++] = sensorSerial.read();
    else {
      mqtt.loop();
      delay(1);
    }
  }
  return leidos == cantidad;
}

bool leerPaquete(uint8_t &tipo, uint8_t *datos, uint16_t &longitud) {
  uint8_t byte;
  uint32_t inicio = millis();
  while (true) {
    if (!leerExacto(&byte, 1, 3000)) return false;
    if (byte == 0xEF) break;
    if (millis() - inicio >= 3000) return false;
  }
  uint8_t siguiente;
  if (!leerExacto(&siguiente, 1, 3000) || siguiente != 0x01) return false;

  uint8_t direccion[4];
  if (!leerExacto(direccion, 4, 3000)) return false;
  if (!leerExacto(&tipo, 1, 3000)) return false;
  uint8_t longitudBytes[2];
  if (!leerExacto(longitudBytes, 2, 3000)) return false;
  uint16_t longitudPaquete = ((uint16_t)longitudBytes[0] << 8) | longitudBytes[1];
  if (longitudPaquete < 2 || longitudPaquete - 2 > 256) return false;

  longitud = longitudPaquete - 2;
  if (!leerExacto(datos, longitud, 5000)) return false;
  uint8_t checksum[2];
  if (!leerExacto(checksum, 2, 3000)) return false;
  uint16_t esperado = longitudBytes[0] + longitudBytes[1] + tipo;
  for (uint16_t i = 0; i < longitud; i++) esperado += datos[i];
  uint16_t recibido = ((uint16_t)checksum[0] << 8) | checksum[1];
  return esperado == recibido;
}

String codificarBase64(const uint8_t *datos, size_t cantidad) {
  String salida;
  salida.reserve(((cantidad + 2) / 3) * 4);
  for (size_t i = 0; i < cantidad; i += 3) {
    uint32_t valor = (uint32_t)datos[i] << 16;
    if (i + 1 < cantidad) valor |= (uint32_t)datos[i + 1] << 8;
    if (i + 2 < cantidad) valor |= datos[i + 2];
    salida += BASE64[(valor >> 18) & 0x3F];
    salida += BASE64[(valor >> 12) & 0x3F];
    salida += i + 1 < cantidad ? BASE64[(valor >> 6) & 0x3F] : '=';
    salida += i + 2 < cantidad ? BASE64[valor & 0x3F] : '=';
  }
  return salida;
}

void conectarMqtt();

bool descargarPlantilla(uint16_t slot, String &plantilla) {
  if (sensor.loadModel(slot) != FINGERPRINT_OK) return false;
  if (sensor.getModel() != FINGERPRINT_OK) return false;

  uint8_t paquete[256];
  uint8_t plantillaBytes[256];
  uint16_t longitud;
  uint16_t total = 0;
  uint8_t tipo;
  uint32_t limite = millis() + 10000;

  while (millis() < limite && total < sizeof(plantillaBytes)) {
    if (!leerPaquete(tipo, paquete, longitud)) return false;
    if (tipo == 0x02 || tipo == 0x08) {
      uint16_t copiar = min(longitud, (uint16_t)(sizeof(plantillaBytes) - total));
      memcpy(plantillaBytes + total, paquete, copiar);
      total += copiar;
    }
    if (tipo == 0x08) break;
  }

  if (total == 0) return false;
  plantilla = codificarBase64(plantillaBytes, total);
  return true;
}

void publicarResultado(const String &capturaId, const String &resultado,
                       const String &plantilla, const String &mensaje) {
  if (!mqtt.connected()) conectarMqtt();
  String json = String("{\"captura_id\":\"") + capturaId +
                "\",\"dispositivo_id\":\"" + DISPOSITIVO_ID +
                "\",\"resultado\":\"" + resultado + "\"";
  if (plantilla.length()) json += String(",\"plantilla\":\"") + plantilla + "\"";
  if (mensaje.length()) json += String(",\"mensaje\":\"") + mensaje + "\"";
  json += "}";
  bool publicado = mqtt.publish(TOPIC_RESULTADOS, json.c_str(), false);
  Serial.printf("Resultado MQTT %s: %s\n",
                publicado ? "publicado" : "no publicado", resultado.c_str());
}

void procesarOrden(const String &json) {
  if (extraerCampo(json, "operacion") != "ENROLAR") return;
  if (extraerCampo(json, "dispositivo_id") != DISPOSITIVO_ID) return;
  String capturaId = extraerCampo(json, "captura_id");
  if (!capturaId.length()) return;

  String plantilla;
  if (!enrolar(SLOT_HUELLA) || !descargarPlantilla(SLOT_HUELLA, plantilla)) {
    publicarResultado(capturaId, "ERROR", "", "No se pudo obtener la plantilla del AS608");
    return;
  }
  publicarResultado(capturaId, "OK", plantilla, "");
}

void recibirMqtt(char *topic, uint8_t *payload, unsigned int longitud) {
  if (String(topic) != TOPIC_COMANDOS) return;
  String mensaje;
  for (unsigned int i = 0; i < longitud; i++) mensaje += (char)payload[i];
  ordenPendiente = mensaje;
  hayOrdenPendiente = true;
}

void conectarMqtt() {
  while (!mqtt.connected()) {
    String clientId = String(DISPOSITIVO_ID) + "-" + String((uint32_t)ESP.getEfuseMac(), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD)) {
      Serial.println("MQTT conectado");
      mqtt.subscribe(TOPIC_COMANDOS, 1);
      Serial.println("MQTT suscrito a comandos");
    } else {
      Serial.printf("MQTT no conectado, estado: %d\n", mqtt.state());
      delay(3000);
    }
  }
}

bool iniciarSensor(uint32_t baud) {
  sensorSerial.end();
  sensorSerial.begin(
      baud,
      SERIAL_8N1,
      PIN_AS608_TX_ESP32_RX,
      PIN_AS608_RX_ESP32_TX
  );
  sensor.begin(baud);
  // Adafruit_Fingerprint vuelve a inicializar el puerto; se vuelven a fijar
  // los pines para evitar que la UART use los pines por defecto de la placa.
  sensorSerial.begin(
      baud,
      SERIAL_8N1,
      PIN_AS608_TX_ESP32_RX,
      PIN_AS608_RX_ESP32_TX
  );
  delay(300);
  return sensor.verifyPassword();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println();
  Serial.println("Iniciando ESP32 + AS608 + MQTT");
  Serial.printf("UART AS608: RX GPIO%d, TX GPIO%d\n",
                PIN_AS608_TX_ESP32_RX, PIN_AS608_RX_ESP32_TX);

  bool sensorEncontrado = iniciarSensor(BAUD_SENSOR_PRIMARIO);
  if (sensorEncontrado) {
    Serial.printf("AS608 conectado a %lu baudios\n", BAUD_SENSOR_PRIMARIO);
  } else {
    Serial.printf("No responde a %lu. Probando %lu...\n",
                  BAUD_SENSOR_PRIMARIO, BAUD_SENSOR_ALTERNATIVO);
    sensorEncontrado = iniciarSensor(BAUD_SENSOR_ALTERNATIVO);
  }
  if (!sensorEncontrado) {
    Serial.printf("No responde a %lu. Probando %lu...\n",
                  BAUD_SENSOR_ALTERNATIVO, BAUD_SENSOR_TERCERO);
    sensorEncontrado = iniciarSensor(BAUD_SENSOR_TERCERO);
  }
  if (!sensorEncontrado) {
    Serial.printf("No responde a %lu. Probando %lu...\n",
                  BAUD_SENSOR_TERCERO, BAUD_SENSOR_CUARTO);
    sensorEncontrado = iniciarSensor(BAUD_SENSOR_CUARTO);
  }
  if (!sensorEncontrado) {
    Serial.println("AS608 no responde. Revisa VCC, GND, TX/RX y baud UART.");
    while (true) delay(1000);
  }

  Serial.printf("Conectando a WiFi: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi conectado. IP ESP32: ");
  Serial.println(WiFi.localIP());
  Serial.printf("Conectando MQTT a %s:%u\n", MQTT_HOST, MQTT_PORT);
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(recibirMqtt);
  mqtt.setBufferSize(2048);
}

void loop() {
  if (!mqtt.connected()) conectarMqtt();
  mqtt.loop();
  if (hayOrdenPendiente) {
    String orden = ordenPendiente;
    ordenPendiente = "";
    hayOrdenPendiente = false;
    Serial.print("Comando MQTT recibido: ");
    Serial.println(orden);
    procesarOrden(orden);
  }
}
