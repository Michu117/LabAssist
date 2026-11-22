/*
 * LabAssist / ESP32 + AS608. Arduino-ESP32 3.x, ArduinoJson 7,
 * Adafruit Fingerprint Sensor Library. MQTT y mbedTLS vienen con el core.
 *
 * Configurar junto a este sketch un archivo local labassist_secrets.h:
 *   #define LAB_WIFI_SSID "..."
 *   #define LAB_WIFI_PASSWORD "..."
 *   #define LAB_HMAC_HEX "..."  // 64 caracteres hexadecimales minúsculos
 * Opcionales: LAB_MQTT_URI, LAB_MQTT_USER, LAB_MQTT_PASSWORD, LAB_MQTT_CA_PEM (para mqtts://),
 * LAB_NTP_SERVER. No usar mqtt:// fuera del entorno local de desarrollo.
 */
#include <Arduino.h>
#include <Adafruit_Fingerprint.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WiFi.h>
#include <atomic>
#include <esp_random.h>
#include <mbedtls/base64.h>
#include <mbedtls/md.h>
#include <mbedtls/platform_util.h>
#include <mqtt_client.h>
#include <sys/time.h>

#if __has_include("labassist_secrets.h")
#include "labassist_secrets.h"
#endif
#ifndef LAB_WIFI_SSID
#define LAB_WIFI_SSID ""
#endif
#ifndef LAB_WIFI_PASSWORD
#define LAB_WIFI_PASSWORD ""
#endif
#ifndef LAB_MQTT_URI
#define LAB_MQTT_URI "mqtt://192.168.3.19:1883"
#endif
#ifndef LAB_HMAC_HEX
#define LAB_HMAC_HEX ""
#endif
#ifndef LAB_MQTT_USER
#define LAB_MQTT_USER ""
#endif
#ifndef LAB_MQTT_PASSWORD
#define LAB_MQTT_PASSWORD ""
#endif
#ifndef LAB_NTP_SERVER
#define LAB_NTP_SERVER "pool.ntp.org"
#endif

constexpr char LECTOR[] = "esp32-as608-01";
constexpr char COMANDOS[] = "labassist/biometria/esp32-as608-01/comandos";
constexpr char EVENTOS[] = "labassist/biometria/esp32-as608-01/eventos";
constexpr char RESPUESTAS[] = "labassist/biometria/esp32-as608-01/respuestas";
constexpr uint16_t MAX_SLOT = 300;
constexpr uint32_t SONDEO_MS = 100;
constexpr uint32_t REINTENTO_MS = 2500;
constexpr size_t MAX_MENSAJE = 1200;
constexpr uint8_t SENSOR_SIN_MODELO = 0x23;
constexpr uint8_t SENSOR_LEER_INDICE = 0x1f;

enum class Modo { IDLE, ENROLLING, IDENTIFYING, WAITING_AUTH };
enum class Fase { PRIMERA, RETIRAR, SEGUNDA };
enum class Disponibilidad { LIBRE, OCUPADO, INCIERTO };

struct Mensaje {
  bool comando;
  size_t longitud;
  char cuerpo[MAX_MENSAJE];
};
struct Orden {
  String id;
  uint16_t slot = 0;
  int64_t vence = 0;
};
struct Pendiente {
  Orden orden;
  String evento;
  String cuerpo;
  uint32_t ultimoEnvio = 0;
  int64_t limite = 0;
};
struct CapturaVista {
  int64_t vence;
  char id[65];
};

HardwareSerial sensorSerial(2);
Adafruit_Fingerprint finger(&sensorSerial);
Preferences memoria;
CapturaVista capturasVistas[32]{};
CapturaVista modosVistos[16]{};
QueueHandle_t bandeja = nullptr;
esp_mqtt_client_handle_t mqtt = nullptr;
std::atomic<bool> mqttListo{false};
uint8_t clave[32];
uint8_t indice[64]{};
bool sensorListo = false;
bool indiceValido = false;
bool memoriaLista = false;
bool dedoRetirado = false;
bool estadoAnterior = false;
bool conexionAnterior = false;
uint16_t capacidad = 0;
uint32_t ultimoEstado = 0;
uint32_t ultimoSondeo = 0;
uint32_t ultimoSensor = 0;
uint32_t ultimoWifi = 0;
uint32_t inicioFase = 0;
Modo modo = Modo::IDLE;
Fase fase = Fase::PRIMERA;
Orden captura;
Orden identificacion;
Pendiente resultadoCaptura;
Pendiente autorizacion;

bool intervalo(uint32_t desde, uint32_t plazo) { return millis() - desde >= plazo; }

int64_t ahora() {
  timeval reloj{};
  gettimeofday(&reloj, nullptr);
  if (reloj.tv_sec < 1704067200) return 0;
  return int64_t(reloj.tv_sec) * 1000 + reloj.tv_usec / 1000;
}

int64_t fechaUtc(const char *valor) {
  if (!valor) return 0;
  const size_t longitud = strlen(valor);
  if (longitud != 20 && longitud != 24) return 0;
  if (valor[4] != '-' || valor[7] != '-' || valor[10] != 'T' || valor[13] != ':' ||
      valor[16] != ':' || valor[longitud - 1] != 'Z' || (longitud == 24 && valor[19] != '.')) return 0;
  for (size_t i = 0; i < longitud - 1; ++i) {
    if (i == 4 || i == 7 || i == 10 || i == 13 || i == 16 || i == 19) continue;
    if (valor[i] < '0' || valor[i] > '9') return 0;
  }
  auto dos = [valor](size_t i) { return (valor[i] - '0') * 10 + valor[i + 1] - '0'; };
  const int anio = 100 * dos(0) + dos(2);
  const int mes = dos(5), dia = dos(8);
  const int hora = dos(11), minuto = dos(14), segundo = dos(17);
  if (anio < 2024 || anio > 2099 || mes < 1 || mes > 12 || hora > 23 || minuto > 59 || segundo > 59) return 0;
  const int diasMes[]{31, 28 + (anio % 4 == 0), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
  if (dia < 1 || dia > diasMes[mes - 1]) return 0;
  int dias = dia - 1;
  for (int y = 1970; y < anio; ++y) dias += 365 + (y % 4 == 0);
  for (int m = 1; m < mes; ++m) dias += diasMes[m - 1];
  const int ms = longitud == 24 ? dos(20) * 10 + valor[22] - '0' : 0;
  return (((int64_t(dias) * 24 + hora) * 60 + minuto) * 60 + segundo) * 1000 + ms;
}

int digitoHex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  return c >= 'a' && c <= 'f' ? c - 'a' + 10 : -1;
}

bool decodificarHex(const char *hex, uint8_t *salida) {
  if (!hex || strlen(hex) != 64) return false;
  for (size_t i = 0; i < 32; ++i) {
    const int a = digitoHex(hex[2 * i]), b = digitoHex(hex[2 * i + 1]);
    if (a < 0 || b < 0) return false;
    if (salida) salida[i] = uint8_t(a * 16 + b);
  }
  return true;
}

bool calcularFirma(const char *topico, const char *datos, size_t longitud, uint8_t salida[32]) {
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  const auto *algoritmo = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  const bool ok = mbedtls_md_setup(&ctx, algoritmo, 1) == 0 &&
                  mbedtls_md_hmac_starts(&ctx, clave, sizeof(clave)) == 0 &&
                  mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t *>(topico), strlen(topico)) == 0 &&
                  mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t *>("\n"), 1) == 0 &&
                  mbedtls_md_hmac_update(&ctx, reinterpret_cast<const uint8_t *>(datos), longitud) == 0 &&
                  mbedtls_md_hmac_finish(&ctx, salida) == 0;
  mbedtls_md_free(&ctx);
  return ok;
}

bool espacioJson(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r'; }

bool objetoEstricto(JsonDocument &doc, const char *texto, size_t longitud) {
  if (deserializeJson(doc, texto, longitud, DeserializationOption::NestingLimit(3)) ||
      !doc.is<JsonObject>()) return false;
  size_t claves = 0;
  int nivel = 0;
  bool cadena = false, escape = false, cerrado = false;
  for (size_t i = 0; i < longitud; ++i) {
    const char c = texto[i];
    if (cerrado && !espacioJson(c)) return false;
    if (escape) { escape = false; continue; }
    if (cadena && c == '\\') { escape = true; continue; }
    if (c == '"') { cadena = !cadena; continue; }
    if (cadena) continue;
    if (c == '{' || c == '[') ++nivel;
    if (c == '}' || c == ']') cerrado = --nivel == 0;
    if (c == ':' && nivel == 1) ++claves;
  }
  return cerrado && claves == doc.size();
}

const char *cadenaExacta(JsonVariantConst valor) {
  const JsonString s = valor.as<JsonString>();
  return !s.isNull() && strlen(s.c_str()) == s.size() ? s.c_str() : nullptr;
}

bool leerFirmado(const char *topico, const char *cuerpo, size_t longitud, JsonDocument &interior) {
  JsonDocument sobre;
  if (!objetoEstricto(sobre, cuerpo, longitud)) return false;
  const JsonObjectConst objeto = sobre.as<JsonObjectConst>();
  const JsonString datos = objeto["datos"].as<JsonString>();
  const JsonString firma = objeto["firma"].as<JsonString>();
  uint8_t recibida[32], esperada[32];
  if (objeto.size() != 2 || datos.isNull() || firma.isNull() ||
      strlen(datos.c_str()) != datos.size() || firma.size() != 64 ||
      !decodificarHex(firma.c_str(), recibida) ||
      !calcularFirma(topico, datos.c_str(), datos.size(), esperada)) return false;
  volatile uint8_t diferencia = 0;
  for (size_t i = 0; i < 32; ++i) diferencia = diferencia | (recibida[i] ^ esperada[i]);
  if (diferencia || !objetoEstricto(interior, datos.c_str(), datos.size())) return false;
  const char *identidad = cadenaExacta(interior["dispositivo_id"]);
  return identidad && !strcmp(identidad, LECTOR);
}

String eventoFirmado(JsonDocument &evento) {
  evento["dispositivo_id"] = LECTOR;
  String datos;
  if (evento.overflowed() || !serializeJson(evento, datos)) return "";
  uint8_t digest[32];
  if (!calcularFirma(EVENTOS, datos.c_str(), datos.length(), digest)) return "";
  char firma[65];
  for (size_t i = 0; i < 32; ++i) snprintf(firma + 2 * i, 3, "%02x", digest[i]);
  JsonDocument sobre;
  sobre["datos"] = datos;
  sobre["firma"] = firma;
  String salida;
  if (!sobre.overflowed()) serializeJson(sobre, salida);
  mbedtls_platform_zeroize(datos.begin(), datos.length());
  return salida;
}

bool publicar(const String &cuerpo) {
  return mqttListo && cuerpo.length() &&
         esp_mqtt_client_enqueue(mqtt, EVENTOS, cuerpo.c_str(), cuerpo.length(), 1, 0, true) >= 0;
}

void eventoMqtt(void *, esp_event_base_t, int32_t evento, void *datos) {
  auto *e = static_cast<esp_mqtt_event_handle_t>(datos);
  static Mensaje parcial{};
  static size_t recibido = 0;
  static bool aceptando = false;
  static int comandosAck = -1, respuestasAck = -1;
  if (evento == MQTT_EVENT_CONNECTED) {
    comandosAck = esp_mqtt_client_subscribe(mqtt, COMANDOS, 1);
    respuestasAck = esp_mqtt_client_subscribe(mqtt, RESPUESTAS, 1);
  } else if (evento == MQTT_EVENT_SUBSCRIBED) {
    if (e->msg_id == comandosAck) comandosAck = -2;
    if (e->msg_id == respuestasAck) respuestasAck = -2;
    mqttListo = comandosAck == -2 && respuestasAck == -2;
  } else if (evento == MQTT_EVENT_DISCONNECTED) {
    mqttListo = false;
    aceptando = false;
    xQueueReset(bandeja);
  } else if (evento == MQTT_EVENT_DATA) {
    if (e->current_data_offset == 0) {
      const bool comando = e->topic_len == sizeof(COMANDOS) - 1 && !memcmp(e->topic, COMANDOS, e->topic_len);
      const bool respuesta = e->topic_len == sizeof(RESPUESTAS) - 1 && !memcmp(e->topic, RESPUESTAS, e->topic_len);
      aceptando = mqttListo && !e->retain && (comando || respuesta) &&
                  e->total_data_len > 0 && e->total_data_len < int(MAX_MENSAJE);
      parcial.comando = comando;
      parcial.longitud = aceptando ? e->total_data_len : 0;
      recibido = 0;
    }
    if (!aceptando || size_t(e->current_data_offset) != recibido || e->data_len < 0 ||
        size_t(e->data_len) > parcial.longitud - recibido) {
      aceptando = false;
      return;
    }
    memcpy(parcial.cuerpo + recibido, e->data, e->data_len);
    recibido += e->data_len;
    if (recibido == parcial.longitud) {
      parcial.cuerpo[recibido] = '\0';
      xQueueSend(bandeja, &parcial, 0);
      aceptando = false;
    }
  }
}

bool iniciarMqtt() {
  esp_mqtt_client_config_t config{};
  config.broker.address.uri = LAB_MQTT_URI;
#ifdef LAB_MQTT_CA_PEM
  config.broker.verification.certificate = LAB_MQTT_CA_PEM;
#endif
  config.credentials.client_id = LECTOR;
  config.credentials.username = LAB_MQTT_USER;
  config.credentials.authentication.password = LAB_MQTT_PASSWORD;
  config.network.reconnect_timeout_ms = 3000;
  config.network.timeout_ms = 4000;
  config.buffer.size = 2048;
  config.outbox.limit = 16384;
  mqtt = esp_mqtt_client_init(&config);
  if (!mqtt) return false;
  if (esp_mqtt_client_register_event(mqtt, MQTT_EVENT_ANY, eventoMqtt, nullptr) == ESP_OK &&
      esp_mqtt_client_start(mqtt) == ESP_OK) return true;
  esp_mqtt_client_destroy(mqtt);
  mqtt = nullptr;
  return false;
}

bool leerExacto(uint8_t *destino, size_t cantidad, uint32_t inicio, uint32_t limite) {
  size_t leidos = 0;
  while (leidos < cantidad && !intervalo(inicio, limite)) {
    const int byte = sensorSerial.read();
    if (byte >= 0) destino[leidos++] = uint8_t(byte);
    else delay(1);
  }
  return leidos == cantidad;
}

bool leerPaquete(uint8_t &tipo, uint8_t *datos, size_t maximo, uint16_t &longitud,
                 uint32_t inicio, uint32_t limite) {
  uint8_t cabecera[9];
  if (!leerExacto(cabecera, sizeof(cabecera), inicio, limite) ||
      cabecera[0] != 0xef || cabecera[1] != 0x01) return false;
  for (uint8_t i = 0; i < 4; ++i) {
    if (cabecera[2 + i] != uint8_t(finger.device_addr >> (24 - 8 * i))) return false;
  }
  tipo = cabecera[6];
  const uint16_t bytes = uint16_t(cabecera[7]) * 256 + cabecera[8];
  if (bytes < 2 || size_t(bytes - 2) > maximo) return false;
  longitud = bytes - 2;
  uint8_t checksum[2];
  if (!leerExacto(datos, longitud, inicio, limite) || !leerExacto(checksum, 2, inicio, limite)) return false;
  uint16_t suma = tipo + cabecera[7] + cabecera[8];
  for (uint16_t i = 0; i < longitud; ++i) suma += datos[i];
  return suma == uint16_t(checksum[0]) * 256 + checksum[1];
}

bool comandoSensor(uint8_t *comando, uint8_t longitud, uint8_t *respuesta, size_t maximo, uint16_t &leidos) {
  while (sensorSerial.available()) sensorSerial.read();
  Adafruit_Fingerprint_Packet paquete(FINGERPRINT_COMMANDPACKET, longitud, comando);
  finger.writeStructuredPacket(paquete);
  uint8_t tipo;
  return leerPaquete(tipo, respuesta, maximo, leidos, millis(), 1500) &&
         tipo == FINGERPRINT_ACKPACKET && leidos > 0;
}

bool leerIndice(uint8_t pagina, uint8_t *destino) {
  uint8_t comando[]{SENSOR_LEER_INDICE, pagina};
  uint8_t respuesta[33];
  uint16_t leidos;
  if (!comandoSensor(comando, sizeof(comando), respuesta, sizeof(respuesta), leidos) ||
      leidos != sizeof(respuesta) || respuesta[0] != FINGERPRINT_OK) return false;
  memcpy(destino, respuesta + 1, 32);
  return true;
}

bool ocupadoEn(const uint8_t *mapa, uint16_t slot) {
  return (mapa[slot / 8] & (1U << (slot % 8))) != 0;
}

bool actualizarIndice() {
  indiceValido = sensorListo && leerIndice(0, indice) &&
                 (capacidad < 256 || leerIndice(1, indice + 32));
  return indiceValido;
}

Disponibilidad verificarSlot(uint16_t slot, bool verificarCarga) {
  uint8_t pagina[32];
  if (!leerIndice(slot / 256, pagina)) return Disponibilidad::INCIERTO;
  if (ocupadoEn(pagina, slot % 256)) return Disponibilidad::OCUPADO;
  if (!verificarCarga) return Disponibilidad::LIBRE;
  const uint8_t carga = finger.loadModel(slot);
  if (carga == FINGERPRINT_OK) return Disponibilidad::OCUPADO;
  // BADLOCATION, errores UART/flash y códigos desconocidos no prueban que sea libre.
  return carga == FINGERPRINT_DBRANGEFAIL || carga == SENSOR_SIN_MODELO
      ? Disponibilidad::LIBRE : Disponibilidad::INCIERTO;
}

uint8_t buscarRango(uint16_t inicio, uint16_t cantidad, uint16_t &slot) {
  uint8_t orden[]{FINGERPRINT_HISPEEDSEARCH, 1, uint8_t(inicio >> 8), uint8_t(inicio),
                  uint8_t(cantidad >> 8), uint8_t(cantidad)};
  uint8_t respuesta[5];
  uint16_t leidos;
  if (!comandoSensor(orden, sizeof(orden), respuesta, sizeof(respuesta), leidos)) return FINGERPRINT_PACKETRECIEVEERR;
  if (respuesta[0] != FINGERPRINT_OK) return respuesta[0];
  if (leidos != sizeof(respuesta)) return FINGERPRINT_PACKETRECIEVEERR;
  slot = uint16_t(respuesta[1]) * 256 + respuesta[2];
  return slot >= inicio && uint32_t(slot) < uint32_t(inicio) + cantidad
      ? FINGERPRINT_OK : FINGERPRINT_PACKETRECIEVEERR;
}

uint8_t fingerFastSearch(uint16_t &slot) {
  // La versión Adafruit instalada limita fingerFastSearch() a 0xA3 posiciones.
  // Se usa el mismo comando de búsqueda rápida con el rango real del AS608.
  const uint8_t resultado = buscarRango(0, finger.capacity, slot);
  if (resultado == FINGERPRINT_NOTFOUND && capacidad == finger.capacity &&
      indiceValido && ocupadoEn(indice, capacidad)) return buscarRango(capacidad, 1, slot);
  return resultado;
}

bool descargarPlantilla(String &plantilla) {
  if (finger.getModel() != FINGERPRINT_OK) return false;
  uint8_t bytes[1024]{};
  uint8_t paquete[256]{};
  uint8_t base64[1370]{};
  size_t total = 0, codificados = 0;
  bool completa = false;
  const uint32_t inicio = millis();
  while (!completa && !intervalo(inicio, 5000)) {
    uint8_t tipo;
    uint16_t longitud;
    if (!leerPaquete(tipo, paquete, sizeof(paquete), longitud, inicio, 5000) ||
        (tipo != FINGERPRINT_DATAPACKET && tipo != FINGERPRINT_ENDDATAPACKET) ||
        longitud == 0 || total + longitud > sizeof(bytes)) break;
    memcpy(bytes + total, paquete, longitud);
    total += longitud;
    completa = tipo == FINGERPRINT_ENDDATAPACKET;
  }
  bool ok = completa && mbedtls_base64_encode(base64, sizeof(base64), &codificados, bytes, total) == 0;
  if (ok) ok = plantilla.concat(reinterpret_cast<const char *>(base64), codificados);
  mbedtls_platform_zeroize(bytes, sizeof(bytes));
  mbedtls_platform_zeroize(paquete, sizeof(paquete));
  mbedtls_platform_zeroize(base64, sizeof(base64));
  return ok;
}

bool iniciarSensor() {
  const uint32_t velocidades[]{57600, 9600, 115200, 19200};
  for (const auto baud : velocidades) {
    sensorSerial.end();
    sensorSerial.begin(baud, SERIAL_8N1, 27, 26);
    delay(120);
    if (!finger.verifyPassword()) continue;
    if (finger.getParameters() != FINGERPRINT_OK || finger.capacity == 0) continue;
    capacidad = min(finger.capacity, MAX_SLOT);
    Serial.printf("AS608 conectado a %lu baudios. Capacidad: %u\n", (unsigned long)baud, finger.capacity);
    return true;
  }
  Serial.println("AS608 sin respuesta o sin parámetros válidos");
  return false;
}

bool vigente(int64_t vence) {
  const int64_t instante = ahora();
  return instante && vence > instante;
}

void regresar() {
  modo = vigente(identificacion.vence) ? Modo::IDENTIFYING : Modo::IDLE;
  dedoRetirado = false;
}

void limpiar(Pendiente &p) {
  if (p.cuerpo.length()) mbedtls_platform_zeroize(p.cuerpo.begin(), p.cuerpo.length());
  p = Pendiente{};
}

void enviarPendiente(Pendiente &p, bool inmediato = false) {
  if (p.cuerpo.length() && vigente(p.limite) && (inmediato || intervalo(p.ultimoEnvio, REINTENTO_MS))) {
    p.ultimoEnvio = millis();
    publicar(p.cuerpo);
  }
}

String cuerpoCaptura(const Orden &orden, const char *codigo, const String &plantilla = String()) {
  JsonDocument evento;
  evento["operacion"] = "RESULTADO_ENROLAR";
  evento["captura_id"] = orden.id;
  evento["slot"] = orden.slot;
  evento["resultado"] = codigo ? "ERROR" : "OK";
  if (codigo) evento["codigo"] = codigo;
  else evento["plantilla"] = plantilla.c_str();
  return eventoFirmado(evento);
}

void terminarCaptura(const char *codigo, const String &plantilla = String()) {
  resultadoCaptura.orden = captura;
  resultadoCaptura.limite = captura.vence;
  resultadoCaptura.cuerpo = cuerpoCaptura(captura, codigo, plantilla);
  captura = Orden{};
  regresar();
  enviarPendiente(resultadoCaptura, true);
  if (codigo) Serial.printf("Enrolamiento rechazado: %s\n", codigo);
}

void avanzarCaptura() {
  if (!vigente(captura.vence)) {
    captura = Orden{};
    regresar();
    Serial.println("Enrolamiento vencido");
    return;
  }
  if (intervalo(inicioFase, 25000)) {
    terminarCaptura("CAPTURA_FALLIDA");
    return;
  }
  const uint8_t imagen = finger.getImage();
  if (imagen != FINGERPRINT_OK && imagen != FINGERPRINT_NOFINGER) {
    terminarCaptura("CAPTURA_FALLIDA");
    return;
  }
  if (fase == Fase::RETIRAR) {
    if (imagen == FINGERPRINT_NOFINGER) {
      fase = Fase::SEGUNDA;
      inicioFase = millis();
      Serial.println("Coloca el mismo dedo otra vez");
    }
    return;
  }
  if (imagen == FINGERPRINT_NOFINGER) return;
  if (finger.image2Tz(fase == Fase::PRIMERA ? 1 : 2) != FINGERPRINT_OK) {
    terminarCaptura("CAPTURA_FALLIDA");
    return;
  }
  if (fase == Fase::PRIMERA) {
    uint16_t existente;
    const uint8_t resultado = fingerFastSearch(existente);
    if (resultado != FINGERPRINT_NOTFOUND) {
      terminarCaptura(resultado == FINGERPRINT_OK ? "HUELLA_DUPLICADA" : "CAPTURA_FALLIDA");
      return;
    }
    fase = Fase::RETIRAR;
    inicioFase = millis();
    Serial.println("Primera captura correcta. Retira el dedo");
    return;
  }
  Serial.println("Segunda captura correcta");
  if (finger.createModel() != FINGERPRINT_OK) {
    terminarCaptura("CAPTURA_FALLIDA");
    return;
  }
  const Disponibilidad disponible = verificarSlot(captura.slot, false);
  if (disponible != Disponibilidad::LIBRE || !vigente(captura.vence)) {
    terminarCaptura(disponible == Disponibilidad::OCUPADO ? "SLOT_OCUPADO" : "CAPTURA_FALLIDA");
    return;
  }
  if (finger.storeModel(captura.slot) != FINGERPRINT_OK) {
    terminarCaptura("CAPTURA_FALLIDA");
    return;
  }
  // Se vuelve a leer el inventario después de cualquier escritura admitida.
  indiceValido = false;
  Serial.printf("Huella almacenada en slot %u\n", captura.slot);
  String plantilla;
  if (finger.loadModel(captura.slot) == FINGERPRINT_OK && descargarPlantilla(plantilla)) {
    terminarCaptura(nullptr, plantilla);
    mbedtls_platform_zeroize(plantilla.begin(), plantilla.length());
  } else {
    terminarCaptura("CAPTURA_FALLIDA");
  }
}

void avanzarIdentificacion() {
  if (!vigente(identificacion.vence)) {
    regresar();
    return;
  }
  const uint8_t imagen = finger.getImage();
  if (imagen == FINGERPRINT_NOFINGER) {
    dedoRetirado = true;
    return;
  }
  if (imagen != FINGERPRINT_OK || !dedoRetirado || !mqttListo || !indiceValido) return;
  dedoRetirado = false;
  uint16_t slot;
  if (finger.image2Tz(1) != FINGERPRINT_OK) {
    Serial.println("No se pudo procesar la imagen");
    return;
  }
  const uint8_t resultado = fingerFastSearch(slot);
  if (resultado != FINGERPRINT_OK || slot == 0 || slot > capacidad) {
    Serial.println(resultado == FINGERPRINT_NOTFOUND || resultado == FINGERPRINT_OK
                       ? "Huella sin coincidencia utilizable" : "Error en la búsqueda del AS608");
    return;
  }
  char id[33];
  for (size_t i = 0; i < 4; ++i) snprintf(id + i * 8, 9, "%08lx", (unsigned long)esp_random());
  JsonDocument evento;
  evento["operacion"] = "IDENTIFICACION";
  evento["modo_id"] = identificacion.id;
  evento["evento_id"] = id;
  evento["slot"] = slot;
  autorizacion.orden = identificacion;
  autorizacion.evento = id;
  autorizacion.cuerpo = eventoFirmado(evento);
  autorizacion.limite = min(identificacion.vence, ahora() + 15000);
  modo = Modo::WAITING_AUTH;
  Serial.printf("Huella identificada en slot %u. Esperando al backend\n", slot);
  enviarPendiente(autorizacion, true);
}

template <size_t N>
bool yaVista(const CapturaVista (&historial)[N], const char *id) {
  const int64_t instante = ahora();
  for (const auto &v : historial) {
    if (v.vence > instante && !strncmp(id, v.id, sizeof(v.id))) return true;
  }
  return false;
}

template <size_t N>
bool recordar(CapturaVista (&historial)[N], const Orden &orden) {
  const int64_t instante = ahora();
  for (auto &v : historial) {
    if (v.vence > instante) continue;
    v.vence = orden.vence;
    orden.id.toCharArray(v.id, sizeof(v.id));
    return true;
  }
  return false;
}

void procesarOrden(JsonObjectConst datos) {
  const int64_t vence = fechaUtc(cadenaExacta(datos["vence_en"]));
  if (!vigente(vence) || vence - ahora() > 15 * 60 * 1000L + 15000) return;
  if (datos["operacion"] == "IDENTIFICAR") {
    const char *id = cadenaExacta(datos["modo_id"]);
    if (datos.size() != 4 || !decodificarHex(id, nullptr) || yaVista(modosVistos, id)) return;
    const Orden orden{id, 0, vence};
    if (!recordar(modosVistos, orden)) return;
    identificacion = orden;
    limpiar(autorizacion);
    if (modo != Modo::ENROLLING) regresar();
    Serial.println("Modo identificación activo");
    return;
  }
  if (datos["operacion"] != "ENROLAR") return;
  const char *id = cadenaExacta(datos["captura_id"]);
  if (datos.size() != 5 || !decodificarHex(id, nullptr) || !datos["slot"].is<uint16_t>()) return;
  const uint16_t slot = datos["slot"].as<uint16_t>();
  if (!slot || slot > MAX_SLOT) return;
  if (resultadoCaptura.orden.id == id) {
    if (resultadoCaptura.orden.slot == slot) enviarPendiente(resultadoCaptura);
    return;
  }
  if (yaVista(capturasVistas, id)) return;
  const Orden orden{id, slot, vence};
  if (!memoriaLista || !recordar(capturasVistas, orden) ||
      memoria.putBytes("capturas", capturasVistas, sizeof(capturasVistas)) != sizeof(capturasVistas)) {
    publicar(cuerpoCaptura(orden, "CAPTURA_FALLIDA"));
    return;
  }
  if (modo == Modo::ENROLLING || modo == Modo::WAITING_AUTH || resultadoCaptura.cuerpo.length()) {
    publicar(cuerpoCaptura(orden, "SENSOR_OCUPADO"));
    return;
  }
  if (!sensorListo || !actualizarIndice() || slot > capacidad) {
    publicar(cuerpoCaptura(orden, "CAPTURA_FALLIDA"));
    return;
  }
  captura = orden;
  const auto disponible = verificarSlot(slot, true);
  if (disponible != Disponibilidad::LIBRE) {
    terminarCaptura(disponible == Disponibilidad::OCUPADO ? "SLOT_OCUPADO" : "CAPTURA_FALLIDA");
    return;
  }
  modo = Modo::ENROLLING;
  fase = Fase::PRIMERA;
  inicioFase = millis();
  Serial.printf("Modo enrolamiento. Slot autorizado: %u\n", slot);
  Serial.println("Coloca el dedo");
}

void procesarRespuesta(JsonObjectConst datos) {
  if (datos["operacion"] == "ACUSE_ENROLAR" && resultadoCaptura.cuerpo.length() &&
      vigente(resultadoCaptura.limite) && datos["captura_id"] == resultadoCaptura.orden.id &&
      datos["slot"].is<uint16_t>() && datos["slot"].as<uint16_t>() == resultadoCaptura.orden.slot) {
    const bool aceptado = datos.size() == 5 && datos["resultado"] == "ACEPTADO";
    const bool rechazado = datos.size() == 6 && datos["resultado"] == "RECHAZADO" &&
                           datos["codigo"] == "CAPTURA_NO_VIGENTE_O_EN_CONFLICTO";
    if (!aceptado && !rechazado) return;
    limpiar(resultadoCaptura);
    Serial.println(aceptado ? "Backend confirmó recepción del resultado" : "Backend rechazó el resultado de captura");
  }
  if (datos["operacion"] == "RESULTADO_ASISTENCIA" && modo == Modo::WAITING_AUTH &&
      vigente(autorizacion.limite) && datos.size() == 6 &&
      datos["modo_id"] == autorizacion.orden.id && datos["evento_id"] == autorizacion.evento) {
    const bool autorizado = datos["resultado"] == "AUTORIZADA" && fechaUtc(datos["asistencia_en"].as<const char *>());
    const bool denegado = datos["resultado"] == "RECHAZADA" && datos["codigo"].is<const char *>();
    if (!autorizado && !denegado) return;
    limpiar(autorizacion);
    regresar();
    Serial.println(autorizado ? "Asistencia autorizada por el backend" : "Asistencia denegada por el backend");
  }
}

void publicarEstado(bool listo) {
  JsonDocument evento;
  evento["operacion"] = "ESTADO";
  evento["emitido_en"] = ahora();
  evento["listo"] = listo;
  JsonArray usados = evento["slots_ocupados"].to<JsonArray>();
  if (indiceValido) {
    for (uint16_t slot = 1; slot <= capacidad; ++slot) if (ocupadoEn(indice, slot)) usados.add(slot);
  }
  publicar(eventoFirmado(evento));
}

void setup() {
  Serial.begin(115200);
  if (!decodificarHex(LAB_HMAC_HEX, clave) || !strlen(LAB_WIFI_SSID) || !strlen(LAB_MQTT_URI)) {
    Serial.println("Falta configuración local de Wi-Fi, MQTT o HMAC");
    return;
  }
  memoriaLista = memoria.begin("labassist", false);
  if (memoriaLista && memoria.isKey("capturas")) {
    memoriaLista = memoria.getBytesLength("capturas") == sizeof(capturasVistas) &&
                   memoria.getBytes("capturas", capturasVistas, sizeof(capturasVistas)) == sizeof(capturasVistas);
  }
  if (!memoriaLista) Serial.println("Registro de duplicados no disponible; enrolamiento bloqueado");
  bandeja = xQueueCreate(8, sizeof(Mensaje));
  if (!bandeja) return;
  sensorListo = iniciarSensor();
  ultimoSensor = millis();
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(LAB_WIFI_SSID, LAB_WIFI_PASSWORD);
  configTime(0, 0, LAB_NTP_SERVER);
}

void loop() {
  if (!bandeja) {
    delay(250);
    return;
  }
  if (WiFi.status() != WL_CONNECTED && intervalo(ultimoWifi, 10000)) {
    ultimoWifi = millis();
    WiFi.reconnect();
  }
  if (!mqtt && WiFi.status() == WL_CONNECTED && ahora() && intervalo(ultimoWifi, 5000)) {
    ultimoWifi = millis();
    if (!iniciarMqtt()) Serial.println("No se pudo iniciar MQTT");
  }
  const bool conectado = mqttListo;
  if (conectado != conexionAnterior) {
    Serial.println(conectado ? "MQTT conectado y suscrito" : "MQTT desconectado; esperando reconexión");
    conexionAnterior = conectado;
    ultimoEstado = millis() - 5000;
  }

  Mensaje recibido;
  while (xQueueReceive(bandeja, &recibido, 0) == pdTRUE) {
    JsonDocument datos;
    const char *topic = recibido.comando ? COMANDOS : RESPUESTAS;
    if (!leerFirmado(topic, recibido.cuerpo, recibido.longitud, datos)) {
      Serial.println("Mensaje MQTT descartado: firma o formato inválido");
      continue;
    }
    if (recibido.comando) procesarOrden(datos.as<JsonObjectConst>());
    else procesarRespuesta(datos.as<JsonObjectConst>());
  }
  if (resultadoCaptura.cuerpo.length() && !vigente(resultadoCaptura.limite)) limpiar(resultadoCaptura);
  if (modo == Modo::WAITING_AUTH && !vigente(autorizacion.limite)) {
    limpiar(autorizacion);
    regresar();
    Serial.println("Sin autorización: expiró la espera del backend");
  }
  enviarPendiente(resultadoCaptura);
  enviarPendiente(autorizacion);

  if (!sensorListo && intervalo(ultimoSensor, 10000)) {
    ultimoSensor = millis();
    sensorListo = iniciarSensor();
  }
  if (sensorListo && intervalo(ultimoSondeo, SONDEO_MS)) {
    ultimoSondeo = millis();
    if (modo == Modo::ENROLLING) avanzarCaptura();
    else if (modo == Modo::IDENTIFYING) avanzarIdentificacion();
  }

  const bool disponible = sensorListo && memoriaLista && modo != Modo::ENROLLING &&
                          modo != Modo::WAITING_AUTH && !resultadoCaptura.cuerpo.length();
  if (conectado && ahora() && (intervalo(ultimoEstado, 5000) || disponible != estadoAnterior || !indiceValido)) {
    // No consultar el AS608 entre la toma de las imágenes. La tabla ya se leyó al admitir la captura.
    if (modo != Modo::ENROLLING && intervalo(ultimoEstado, 750)) actualizarIndice();
    if (intervalo(ultimoEstado, 750) || disponible != estadoAnterior) {
      ultimoEstado = millis();
      estadoAnterior = disponible;
      publicarEstado(disponible && indiceValido);
    }
  }
  delay(10);
}
