# HU-04 · Selección y reserva de PC

Corresponde a HU-05 de Metodología Scrumban, entrega MMR-03.

## Flujo del estudiante

La opción **Reservar PC** abre `/reservas`. La pantalla lista las sesiones asignadas al estudiante y las computadoras disponibles de la sesión seleccionada. Al confirmar, muestra el código de la PC, el laboratorio, el inicio de la práctica y el vencimiento. La misma pantalla recupera la reserva vigente al volver a abrirla.

El contrato de las cuatro operaciones está en [OpenAPI](../api/openapi.yaml). El backend exige JWT, tipo `ESTUDIANTE` y el cambio de contraseña completado cuando corresponde. La identidad de la reserva siempre procede de la cuenta autenticada.

## Disponibilidad y vencimiento

- El inventario pertenece al laboratorio. Cada sesión tiene inicio y fin, y sus estudiantes se vinculan mediante asignaciones explícitas. Una PC dañada queda fuera de la lista.
- La transacción toma bloqueos de cuenta y PC y vuelve a comprobar la elegibilidad y el plazo. Los índices únicos parciales impiden dos reservas vigentes de la misma PC o del mismo estudiante. Una reserva anticipada bloquea la PC desde su creación, incluso para otras sesiones.
- El vencimiento se calcula en PostgreSQL como el inicio de la práctica más 15 minutos, o el fin si la práctica es más corta. A partir del vencimiento, la reserva pendiente queda fuera de las consultas. El backend registra su expiración al arrancar y cada 30 segundos, y la operación de reserva puede liberar un bloqueo vencido antes de insertar.
- El estado operativo `Reservada` se deriva de la reserva vigente. El estado físico de la computadora se conserva por separado.

## Datos reales e integración pendiente

La migración `005_mmr03_reservas.sql` crea la estructura sin cargar inventario ni asignaciones. Para habilitar el uso con estudiantes reales queda pendiente proporcionar laboratorios, PCs, horarios y asignaciones. Hasta entonces, la pantalla muestra que no hay sesiones disponibles. Si se cambia un horario con reservas pendientes, deberá definirse cómo reconciliar los vencimientos ya calculados.

El modelo admite `asistencia_confirmada_en`. Cuando exista marcación de asistencia, el flujo futuro deberá validar y actualizar la reserva de forma atómica antes del vencimiento, y definir cómo liberar una PC ocupada al finalizar su uso. Las reservas con asistencia confirmada quedan fuera de la expiración por inasistencia.

## Verificación

La prueba `apps/backend/tests/reservas.test.js` requiere `HU04_TEST_DATABASE_URL`, un puerto local explícito y una base desechable y vacía llamada `labassist_hu04_test`. Comprueba nombre y ausencia de tablas de aplicación antes de ejecutar migraciones. Las pruebas insertan sus casos solo en esa base y no usan el helper que elimina el esquema `public`.

La cobertura incluye autenticación y permisos, sesiones inválidas, PCs dañadas o ajenas, confirmación, consulta propia, concurrencia, restricciones directas en PostgreSQL y liberación sin tráfico. También se verifica el endpoint de salud, la compilación del frontend y la lectura del contrato OpenAPI.
