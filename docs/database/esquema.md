# Esquema de base de datos — MMR-01

Migración aplicada: `apps/backend/src/database/migrations/001_esquema_inicial.sql`.

Se ejecuta con `npm run migrate` y registra lo aplicado en la tabla técnica
`migracion`, por lo que no se repite en cada arranque.

## Tablas del dominio

| Tabla | Columnas | Restricciones |
| --- | --- | --- |
| `usuario` | `id`, `nombre`, `apellido`, `cedula`, `correo` | `id` PK; `cedula` y `correo` únicas |
| `cuenta` | `usuario_id`, `cuenta`, `clave` | `usuario_id` PK y FK → `usuario` (CASCADE); `cuenta` única |
| `estudiante` | `usuario_id`, `carrera`, `ciclo`, `huella` | `usuario_id` PK y FK → `usuario` (CASCADE) |
| `tecnico_docente` | `usuario_id` | `usuario_id` PK y FK → `usuario` (CASCADE) |

## Reglas

- `id` y `usuario_id` son claves técnicas, no atributos del dominio UML.
- `cuenta.cuenta` guarda el correo institucional, porque RF02 y HU-01 exigen
  iniciar sesión con correo y contraseña.
- `cuenta.clave` guarda el hash de bcrypt (costo mínimo 10).
- `huella` queda en `NULL` en este avance; la API no la recibe ni la devuelve.
- El tipo de usuario se deriva de la tabla en la que existe: `estudiante` o
  `tecnico_docente`. No hay columna `rol`.
- No existen columnas de negocio como `estado`, `activo`, `clave_temporal` o
  `creado_en`.
- La creación de un usuario con sus tablas relacionadas se hace en una
  transacción.

## Tabla técnica

| Tabla | Columnas | Propósito |
| --- | --- | --- |
| `migracion` | `nombre`, `aplicada_en` | Registrar las migraciones ya aplicadas. No pertenece al dominio UML. |

## Tablas pendientes (siguientes entregas)

`Laboratorio`, `Computadora`, `Reportes` y `RegistroAsistencia` y sus
enumeraciones no se crean en MMR-01.
