# LabAssist

Sistema para el registro de asistencia y la gestión del uso de los laboratorios de computación de la Carrera de Computación de la UNL.

Este avance corresponde a **MMR-01: Autenticación y Control de Acceso** (módulo de usuarios): registro de estudiantes, inicio de sesión con JWT, perfil propio, cambio de contraseña y CRUD de usuarios por el Técnico Docente.

## Tecnologías

| Área | Tecnología |
| --- | --- |
| Frontend | React, Vite, React Router |
| Backend | Node.js, Express |
| Base de datos | PostgreSQL con `pg` (sin ORM) |
| Autenticación | JWT (`jsonwebtoken`) y `bcrypt` |
| Validación | Zod |
| Pruebas | Jest y Supertest |
| Contenedores | Docker y Docker Compose |

## Estructura

```text
LabAssist/
├── apps/
│   ├── backend/        # API REST (Express)
│   └── frontend/       # Cliente web (React + Vite)
├── docs/
│   ├── api/openapi.yaml        # Contrato OpenAPI 3
│   ├── database/esquema.md     # Esquema de PostgreSQL
│   └── diagrama-dominio.png    # Diagrama de dominio (UML)
├── .env.example        # Variables para Docker Compose
└── docker-compose.yml
```

Frontend y backend tienen su propio `package.json` y se instalan y ejecutan por separado.

## Requisitos

- **Con Docker:** Docker y Docker Compose v2.
- **Sin Docker:** Node.js 22 o superior (los scripts usan `--env-file-if-exists`) y PostgreSQL 16.

Clona el repositorio:

```bash
git clone https://github.com/Michu117/LabAssist.git
cd LabAssist
```

## Ejecución con Docker

1. Copia la configuración local:

   ```bash
   cp .env.example .env
   ```

2. Construye y levanta la base de datos, el backend y el frontend:

   ```bash
   docker compose up --build -d
   ```

   El backend ejecuta las migraciones en cada arranque; las ya aplicadas no se repiten.

3. Crea el primer Técnico Docente (solo la primera vez; si ya existe, no se duplica):

   ```bash
   docker compose exec backend npm run seed:tecnico
   ```

4. Abre la aplicación:

   | Servicio | URL |
   | --- | --- |
   | Frontend | <http://localhost:5173> |
   | API | <http://localhost:3000/api/v1> |
   | Estado de la API | <http://localhost:3000/api/v1/salud> |
   | PostgreSQL | `127.0.0.1:5432` |

Comandos útiles:

```bash
docker compose logs -f backend   # consulta los registros del backend
docker compose ps                # estado de los servicios
docker compose down              # detiene el sistema y conserva los datos
```

> `docker compose down -v` borra también el volumen de la base de datos. Úsalo solo si quieres empezar desde cero.

`VITE_API_URL` se incluye en el frontend al compilar. Si la cambias en `.env`, reconstruye la imagen con `docker compose up --build -d frontend`.

Si el puerto `5432` ya está ocupado por un PostgreSQL local, detén ese servicio o cambia el puerto publicado de `db` en `docker-compose.yml` (por ejemplo, `127.0.0.1:5434:5432`).

## Ejecución sin Docker

### 1. Base de datos

Con PostgreSQL en ejecución, crea la base de datos:

```bash
createdb -U postgres labassist
```

### 2. Backend

```bash
cd apps/backend
cp .env.example .env     # ajusta DATABASE_URL y JWT_SECRET si es necesario
npm install
npm run migrate          # crea las tablas
npm run seed:tecnico     # crea el primer Técnico Docente
npm run dev              # inicia la API en http://localhost:3000
```

### 3. Frontend

En otra terminal:

```bash
cd apps/frontend
cp .env.example .env     # VITE_API_URL apunta a la API
npm install
npm run dev              # inicia la aplicación en http://localhost:5173
```

Para generar la versión de producción: `npm run build` (salida en `dist/`) y `npm run preview` para revisarla.

## Variables de entorno

### Backend (`apps/backend/.env`)

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `PORT` | Puerto de la API | `3000` |
| `DATABASE_URL` | Conexión a PostgreSQL | `postgresql://postgres:postgres@localhost:5432/labassist` |
| `JWT_SECRET` | Secreto para firmar los tokens | `secreto_local_de_desarrollo` |
| `JWT_EXPIRES_IN` | Vigencia del token | `1h` |
| `FRONTEND_URL` | Origen permitido por CORS | `http://localhost:5173` |
| `SEED_TECNICO_*` | Datos del primer Técnico Docente (`NOMBRE`, `APELLIDO`, `CEDULA`, `CORREO`, `CLAVE`) | Ver `.env.example` |
| `TEST_DATABASE_URL` | Base de datos de pruebas (solo para `npm test`) | `postgresql://postgres:postgres@localhost:5432/labassist_test` |

### Frontend (`apps/frontend/.env`)

| Variable | Descripción | Ejemplo |
| --- | --- | --- |
| `VITE_API_URL` | URL base de la API | `http://localhost:3000/api/v1` |

### Docker Compose (`.env` en la raíz)

Incluye `POSTGRES_DB`, `POSTGRES_USER` y `POSTGRES_PASSWORD` para el contenedor de la base de datos, además de las variables del backend y `VITE_API_URL`. El `DATABASE_URL` del backend se arma automáticamente a partir de ellas.

> Los valores de los archivos `.env.example` son genéricos y solo sirven para desarrollo local. Cámbialos antes de cualquier despliegue. Los archivos `.env` no se suben al repositorio.

## Primer acceso

Inicia sesión en <http://localhost:5173/login> con el Técnico Docente creado por la semilla. Con los valores de ejemplo:

- **Correo:** `tecnico@unl.edu.ec`
- **Contraseña:** `Tecnico123`

Los estudiantes se registran por su cuenta en `/registro`. Solo un Técnico Docente puede crear otros Técnicos Docentes desde `/usuarios/nuevo`.

| Ruta | Pantalla | Acceso |
| --- | --- | --- |
| `/login` | Inicio de sesión | Público |
| `/registro` | Registro de estudiante | Público |
| `/perfil` | Perfil y edición | Autenticado |
| `/perfil/contrasena` | Cambio de contraseña | Autenticado |
| `/usuarios` | Listado, búsqueda y eliminación | Técnico Docente |
| `/usuarios/nuevo` | Creación de Técnico Docente | Técnico Docente |
| `/usuarios/:id` | Detalle y edición | Técnico Docente |

## API

Prefijo: `/api/v1`. El contrato completo está en [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

| Método | Endpoint | Función | Acceso |
| --- | --- | --- | --- |
| GET | `/salud` | Estado de la API | Público |
| POST | `/auth/registro` | Registrar estudiante | Público |
| POST | `/auth/login` | Iniciar sesión | Público |
| GET | `/usuarios/me` | Consultar perfil propio | Autenticado |
| PATCH | `/usuarios/me` | Editar perfil propio | Autenticado |
| PATCH | `/usuarios/me/contrasena` | Cambiar contraseña | Autenticado |
| GET | `/usuarios` | Listar usuarios | Técnico Docente |
| POST | `/usuarios` | Crear Técnico Docente | Técnico Docente |
| GET | `/usuarios/:id` | Consultar usuario | Técnico Docente |
| PATCH | `/usuarios/:id` | Editar usuario | Técnico Docente |
| DELETE | `/usuarios/:id` | Eliminar usuario | Técnico Docente |

Las rutas protegidas exigen el encabezado `Authorization: Bearer <token>`.

## Pruebas

Las pruebas del backend usan una base de datos separada, definida en `TEST_DATABASE_URL`. Su nombre debe contener `test`; si la variable no está definida, las pruebas de base de datos se omiten.

**Con PostgreSQL local:**

```bash
createdb -U postgres labassist_test
cd apps/backend
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/labassist_test npm test
```

**Con la base de datos de Docker Compose** (la imagen del backend no incluye dependencias de desarrollo, por lo que las pruebas se ejecutan fuera del contenedor):

```bash
docker compose exec db createdb -U postgres labassist_test   # solo la primera vez
cd apps/backend
npm install
TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/labassist_test npm test
```

## Flujo de trabajo

El proyecto sigue GitFlow: `main` (versiones estables), `develop` (integración), `feature/*`, `release/*` y `hotfix/*`. Los cambios se integran a `develop` mediante Pull Request.
