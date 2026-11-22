# HU-02: Registro de Estudiantes con Captura Biométrica

| Campo | Detalle |
| --- | --- |
| **Número** | HU-02 |
| **Usuario** | Estudiante |
| **Nombre de historia** | Registro de Estudiantes con Captura Biométrica |
| **Entrega asignada** | MMR-02 |
| **Clase de servicio** | Estándar |

## Historia de usuario

Como estudiante de la UNL quiero registrar mis datos personales y mi huella dactilar en la plataforma.

## Descripción

El registro captura nombres, apellidos, número de cédula y correo. El administrador o el sistema asigna una contraseña temporal que el estudiante deberá cambiar en su primer inicio de sesión. Durante el registro, se activa el sensor biométrico para capturar la huella dactilar y vincularla a la cuenta del estudiante.

## Criterios de aceptación

### Registro exitoso con huella y clave temporal

**Dado** que se ingresan datos válidos de un estudiante y se coloca la huella en el lector, **cuando** se envía el formulario de registro, **entonces** el sistema crea la cuenta, asigna la clave temporal, guarda la plantilla biométrica cifrada y responde con `201 Created`.

### Cambio obligatorio de contraseña temporal

**Dado** que un estudiante inicia sesión por primera vez con su clave temporal, **cuando** ingresa sus credenciales en la pantalla de Login, **entonces** el sistema lo redirige obligatoriamente a la pantalla de **Cambio de Contraseña** antes de permitirle el acceso al Dashboard.

## Consideraciones técnicas

- El sensor AS608 se conectará mediante la placa ESP32.
- La ESP32 deberá recibir la orden de captura y enviar al backend el resultado mediante MQTT.
- No se debe almacenar una imagen cruda de la huella. En esta iteración se almacenará la plantilla biométrica generada por el sensor en PostgreSQL sin cifrado, tal como se definió para el alcance actual.
- La cuenta del estudiante debe quedar vinculada de forma única con su plantilla biométrica real, no con un identificador de slot del sensor.
- La clave temporal debe almacenarse únicamente como hash y debe marcar la cuenta para exigir su cambio en el primer inicio de sesión.
- La implementación deberá actualizar el modelo actual, donde `estudiante.huella` permanece en `NULL` durante MMR-01.

## Dependencias

- Sensor biométrico AS608.
- Placa ESP32.
- Comunicación ESP32-backend.
- Endpoint de registro de estudiantes.
- Persistencia de la plantilla biométrica.
- Flujo de cambio obligatorio de contraseña temporal.
