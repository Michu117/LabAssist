# Contrato MQTT de biometría de LabAssist

El backend Node.js y el sketch `hardware/esp32_as608/esp32_as608.ino` del repositorio implementan este contrato. Antes de usar un lector físico, comprueba que tenga cargada una versión compatible y que su configuración local coincida con la del backend. El backend anterior publicaba `ENROLAR` en un tópico global y omitía `slot`, lo que explica el error «Slot unico valido requerido» en versiones que exigen ese campo.

## Configuración y autenticación

- El administrador provisiona una fila `biometria_lector(id, laboratorio_id, capacidad, habilitado)` por sensor. `id` coincide con el dispositivo y acepta de 1 a 100 caracteres ASCII de `[A-Za-z0-9_-]`. `capacidad` es el último slot habilitado del intervalo continuo que comienza en 1. Verificar el rango real del sensor al provisionar.
- El backend recibe `BIOMETRIA_CLAVES_JSON` como objeto JSON que asigna al ID de cada lector una clave exclusiva de 32 bytes codificada en 64 dígitos hexadecimales minúsculos. Provisionar esa misma clave en el lector por un canal seguro. El lector predeterminado se configura con `MQTT_DEVICE_ID`. Si se usa Compose, el entorno del proceso backend debe recibir también esta variable de claves.
- Usar TLS para proteger las plantillas y autenticación del broker con ACL. El backend puede suscribirse a los eventos de los lectores y publicar comandos y respuestas. Cada lector puede publicar únicamente sus propios eventos y suscribirse únicamente a sus propios comandos y respuestas. El backend comprueba además la firma de cada evento y el vínculo de PostgreSQL. Ningún mensaje del lector selecciona el laboratorio, el estudiante, la sesión, la reserva ni la PC.
- Cada publicación usa QoS 1, sin retención. El lector rechaza mensajes retenidos y verifica la firma, el tópico, su propio ID y la correlación. Para las órdenes también verifica `vence_en` antes de actuar. Sincronizar su reloj UTC.

| Tópico | Emisor | Operaciones |
| --- | --- | --- |
| `labassist/biometria/{dispositivo_id}/comandos` | Backend | `ENROLAR`, `IDENTIFICAR` |
| `labassist/biometria/{dispositivo_id}/eventos` | Lector | `ESTADO`, `RESULTADO_ENROLAR`, `IDENTIFICACION` |
| `labassist/biometria/{dispositivo_id}/respuestas` | Backend | `ACUSE_ENROLAR`, `RESULTADO_ASISTENCIA` |

Todos los mensajes son un objeto JSON exterior con dos cadenas, `datos` y `firma`. `datos` contiene el texto JSON interior. Calcular `firma` como HMAC-SHA256, en hexadecimal minúsculo, sobre los bytes UTF-8 del tópico exacto, un salto LF y el texto exacto de `datos`. La clave HMAC son los 32 bytes decodificados del hexadecimal configurado. Para validar, usar el texto original de `datos` y no volver a serializarlo. El backend descarta mensajes con firma inválida, tópicos o IDs inconsistentes, mensajes retenidos, eventos que superen 140 000 bytes y cuerpos de evento fuera del esquema.

El JSON interior siempre incluye `operacion` y `dispositivo_id` como cadenas. Los siguientes campos son obligatorios salvo donde se indica. `captura_id` y `modo_id` son 64 caracteres hexadecimales minúsculos. `evento_id` es una cadena de 16 a 64 caracteres de `[A-Za-z0-9_-]`. `slot` es entero positivo, hasta 65 535 y dentro de la capacidad del lector. Los campos `vence_en` y `asistencia_en` son cadenas ISO 8601 en UTC.

Vector para comprobar la firma en Arduino. Usa 32 bytes cero como clave de prueba y el tópico `labassist/biometria/lector-ejemplo/eventos`. La fecha histórica sirve únicamente para verificar HMAC.

```json
{"datos":"{\"operacion\":\"ESTADO\",\"dispositivo_id\":\"lector-ejemplo\",\"emitido_en\":1700000000000,\"listo\":true,\"slots_ocupados\":[1,3]}","firma":"6a1782554a977c5f3e27eeb5ffbc9038ae4a5a21ab9a18f233fb31895e119688"}
```

## Disponibilidad y enrolamiento

| Operación | Campos adicionales y reglas |
| --- | --- |
| `ESTADO` | `emitido_en` entero UNIX en milisegundos, `listo` booleano, `slots_ocupados` arreglo de enteros con el inventario físico. Enviar al conectar y aproximadamente cada 5 s, y al cambiar el estado. `listo` indica que puede aceptar órdenes. El backend exige un estado firmado de máximo 15 s para iniciar una operación. |
| `ENROLAR` | `captura_id`, `slot`, `vence_en`. El lector busca primero si el dedo ya está enrolado y confirma que el slot asignado sigue vacío antes de escribir. Serializa el acceso al sensor. Un reenvío de la misma orden no debe repetir la escritura. |
| `RESULTADO_ENROLAR` | `captura_id`, `slot`, `resultado`. Para `OK`, incluir `plantilla`, cadena Base64 estándar con padding cuando corresponda, de 4 a 100 000 caracteres. Para `ERROR`, incluir `codigo` con `SLOT_OCUPADO`, `HUELLA_DUPLICADA`, `SENSOR_OCUPADO` o `CAPTURA_FALLIDA`. No enviar `plantilla` con un error. |
| `ACUSE_ENROLAR` | `captura_id`, `slot`, `resultado` igual a `ACEPTADO` o `RECHAZADO`. En un rechazo incluye `codigo: "CAPTURA_NO_VIGENTE_O_EN_CONFLICTO"`. Aceptado significa que se persistió el resultado, incluso si el sensor informó un fallo. |

`POST /api/v1/biometria/capturas` (Técnico Docente) acepta un objeto con `dispositivo_id` opcional. Crea una captura de 10 min, responde 201 con el ID, el dispositivo, el slot, el estado y el vencimiento. Devuelve 503 `LECTOR_NO_DISPONIBLE` si falta disponibilidad o falla la publicación y 409 `LECTOR_OCUPADO` o `SIN_SLOTS` si ya hay una captura pendiente o se agotó el inventario. `GET /api/v1/biometria/capturas/:id` devuelve el estado solo al técnico que la inició. `POST /api/v1/auth/registro` consume una captura completada una sola vez y guarda estudiante, lector, slot y plantilla en la misma transacción.

El lector debe conservar el resultado hasta recibir el acuse o llegar a `vence_en`. Si el acuse se pierde, reenvía exactamente el mismo resultado. Un PUBACK del broker no sustituye el acuse de aplicación. El servidor asigna el primer slot disponible excluyendo el inventario físico informado, las huellas registradas y todas las asignaciones anteriores. Un slot queda reservado aunque la captura falle, expire o el envío quede en duda. Su recuperación requiere reconciliar PostgreSQL con el sensor y comprobar físicamente que no existe una huella en ese slot. El backend no sobrescribe ni libera automáticamente una asignación incierta. Las huellas antiguas sin slot siguen almacenadas y requieren enrolamiento o reconciliación autorizada antes de servir para asistencia.

## Identificación y asistencia

`POST /api/v1/biometria/identificacion` (Técnico Docente) acepta un objeto con `dispositivo_id` opcional y devuelve 202 con el ID del modo, el dispositivo y el vencimiento. Devuelve 503 `LECTOR_NO_DISPONIBLE` si falta disponibilidad o falla la publicación y 409 `SESION_CERRADA` si el laboratorio asignado no tiene una sesión abierta con plazo vigente. El modo queda vinculado al lector y a la sesión en PostgreSQL. Una nueva orden sustituye el modo anterior. Vence a los 15 minutos de abrir la sesión.

| Operación | Campos adicionales y reglas |
| --- | --- |
| `IDENTIFICAR` | `modo_id`, `vence_en`. El lector busca coincidencias en el sensor dentro de ese modo. Ante una huella sin coincidencia muestra un rechazo local y no publica un slot. Puede suspender temporalmente la búsqueda para enrolar y reanudarla mientras el modo siga vigente. |
| `IDENTIFICACION` | `modo_id`, `evento_id`, `slot` reconocido. Generar un ID nuevo por lectura, conservarlo durante los reintentos y asociar la respuesta con el ID y el modo pendientes. |
| `RESULTADO_ASISTENCIA` | `modo_id`, `evento_id`, `resultado`. Para `AUTORIZADA`, incluye `asistencia_en`. Para `RECHAZADA`, incluye `codigo`. |

Códigos de rechazo de asistencia: `MODO_NO_VIGENTE` (modo expirado, ajeno o reemplazado, o sesión desactivada), `HUELLA_NO_REGISTRADA` (sin vínculo lector/slot), `RESERVA_NO_ENCONTRADA`, `RESERVA_NO_VIGENTE`, `SESION_CERRADA` (cierre concurrente), `PC_NO_OPERATIVA` y `EVENTO_EN_CONFLICTO` (mismo ID con otro modo o slot). Un lector deshabilitado no recibe confirmación de asistencia.

La respuesta se guarda en la misma transacción que `reserva.asistencia_confirmada_en`. Si se pierde la publicación, reenviar el mismo evento recupera la respuesta persistida. El lector solo actúa sobre una respuesta firmada que corresponda a una lectura pendiente dentro del modo vigente. El backend no confía en horas de ingreso del lector. El dashboard y el Estudiante recogen la ocupación mediante sus GET existentes y el sondeo habitual.
