# HU-05 · Ocupación de laboratorio

Corresponde a HU-06 de Metodología Scrumban, entrega MMR-03.

El Técnico Docente puede abrir **Ocupación de laboratorio** (`/ocupacion`) y seleccionar un laboratorio. La pantalla consulta cada segundo el plano del laboratorio visible, siempre que la solicitud anterior haya terminado. Al ocultar la pestaña se pausa el sondeo. Los errores ocultan las cifras de la lectura anterior y se reintenta la consulta.

## Datos, posiciones y estados

La migración `006_mmr03_posiciones_computadoras.sql` depende de la `005`. Agrega `computadora.fila` y `computadora.columna`. La pareja es opcional y, si existe, debe ser positiva y única dentro del laboratorio. Los equipos sin posición se muestran en una lista aparte. El módulo solo consulta el inventario y las posiciones que ya están en PostgreSQL.

| Estado | Regla |
| --- | --- |
| Disponible | PC normal sin reserva vigente ni confirmación de asistencia. |
| Reservada | PC normal con una reserva pendiente vigente según el predicado de HU-04. |
| Ocupada | Reserva vigente con `asistencia_confirmada_en`. Si la PC también está dañada, el plano indica el daño. |
| Inactiva | PC dañada sin asistencia confirmada vigente. |

El total incluye todas las PCs. El porcentaje previsto es la cantidad de equipos ocupados dividida por el total y multiplicada por 100, con 0 para un laboratorio vacío. El conteo de presentes usa estudiantes distintos con asistencia confirmada vigente. Mientras el flujo de asistencia no esté integrado, ambos indicadores se devuelven como `null` y la interfaz los muestra como pendientes.

## Acceso y protección de datos

Los tres endpoints de [OpenAPI](../api/openapi.yaml) requieren JWT y rol de Técnico Docente. El plano no incluye identificadores de estudiantes ni datos personales. El detalle del ocupante se solicita por separado, comprueba de nuevo el rol y el laboratorio de la PC y exige una confirmación vigente. Las respuestas no se cachean.

## Verificación y dependencias

Las pruebas de `ocupacion.test.js` requieren una base local vacía y dedicada llamada `labassist_hu05_test`, identificada mediante `HU05_TEST_DATABASE_URL`. Verifican permisos, privacidad, posiciones, estadísticas de inventario, laboratorios vacíos y el cambio de estado entre consultas después de reservar o vencer una PC. La regresión de HU-04 utiliza una base aislada distinta.

La base de uso real requiere las migraciones `005` y `006`, inventario y posiciones aprobadas. La marcación biométrica de entrada y la liberación al salir son integraciones futuras. Se debe medir el objetivo inferior a dos segundos desde que se confirme la asistencia en PostgreSQL hasta que se refleje en el navegador con ese flujo real.
