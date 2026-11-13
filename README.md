# Frontend Reservas (React + Vite + Tailwind CSS)

Cliente web unificado (SPA) del sistema de tutorías. Todas las pantallas viven en una sola app con
barra de navegación persistente, y **todas** las peticiones van al **API Gateway** (nunca a un
microservicio ni a la base de datos) usando los DTOs del contrato
[`commons/openapi.yaml`](../commons/commons/src/main/resources/openapi/openapi.yaml).

## Levantar todo de una vez (Docker)

Requisitos: Docker Desktop y los repos clonados como carpetas hermanas:

```text
<carpeta>/
  api-gateway/  eureka-server/  commons/commons/  ms-users/  ms-availability/
  sr-microservicios-rodrigo/   (ms-reservas, ms-notificaciones)
  frontend/                    (este repo; el stack está en frontend/deploy)
```

Windows (PowerShell):

```powershell
.\deploy\up.ps1            # construye y levanta todo
.\deploy\up.ps1 -Pull      # antes hace git pull de cada repo
.\deploy\up.ps1 -Test      # al final corre la prueba de humo (47 verificaciones)
.\deploy\up.ps1 -Down      # apaga todo
```

Linux / macOS / Git Bash: `./deploy/up.sh` (mismas opciones: `--pull`, `--test`, `--rebuild`, `--down`).

La primera vez se crea `deploy/.env` (copia de [`deploy/.env.example`](deploy/.env.example)) con las
credenciales de la base compartida y el `JWT_SECRET`; si existe `ms-users/.env`, se toman de ahí.
`deploy/.env` no se sube al repo.

| Servicio | URL |
|----------|-----|
| Frontend | http://localhost:5173 |
| API Gateway (+ Swagger) | http://localhost:8080 · http://localhost:8080/swagger-ui.html |
| Eureka | http://localhost:8761 |
| Redis Insight | http://localhost:5540 (conexión ya configurada a `redis:6379`) |

Logs de un servicio (incluye las operaciones de caché GET / PUT / EVICT):
`docker compose -f deploy/docker-compose.yml logs -f ms-reservas`

Usuario inicial: `admin@reservas.local` / `ChangeMe123!` (bootstrap de ms-users, configurable en `deploy/.env`).

## Desarrollo local sin Docker

```bash
cp .env.example .env
npm install
npm run dev
```

http://localhost:5173 — Vite reenvía `/api/*` al gateway en `http://127.0.0.1:8080`
(ver `vite.config.ts`). En Docker, nginx hace lo mismo (`deploy/nginx.conf`).

## Pantallas

| Ruta | Rol | Qué muestra |
|------|-----|-------------|
| `/login` | Público | Login contra `POST /auth/login`; el JWT queda en `localStorage` |
| `/contact` | Público | Formulario de contacto (`POST /contact`, permitido sin token en el gateway) |
| `/availability` | Autenticado | Turnos con búsqueda y paginación; alta cabecera-detalle (profesor + fecha → N franjas) |
| `/reservations` | Autenticado | Reservas con búsqueda, filtros y paginación; alta/edición cabecera-detalle (turno → N tipos de consulta) |
| `/consultation-types` | `ADMINISTRATOR` | CRUD del catálogo de tipos de consulta |
| `/notifications` | `ADMINISTRATOR` | Historial (búsqueda + paginación), plantillas de correo (CRUD) y envío manual |
| `/users` | `ADMINISTRATOR` | CRUD de usuarios con sus roles (múltiples) |
| `/error`, `*` | — | Páginas 500 y 404 propias; 403 para secciones sin permiso |

## Cómo se cumple cada criterio

| Criterio | Dónde verlo |
|----------|-------------|
| Solo API Gateway | `src/shared/api/client.ts` (`baseURL=/api` → gateway). Pestaña Network: todo es `/api/...` |
| DTOs | `src/types/api.ts` refleja el OpenAPI de commons; las pantallas formatean los DTOs en el cliente |
| SPA + navegación + framework CSS | React Router + `AppLayout` (sidebar persistente). **Tailwind CSS v4** (`src/styles/global.css`) |
| Errores 404/500 amigables | `features/errors/ErrorPage.tsx`, `ErrorBoundary`, interceptor de respuestas (5xx / timeout → `/error`) |
| Sin IDs técnicos | Los DTOs traen `professorName`, `studentName`, `userName`; las tablas nunca muestran UUIDs |
| Paginación + búsqueda | `shared/ui/Pagination.tsx` y `SearchInput.tsx` en todos los listados (búsqueda `q` resuelta en el backend) |
| Selects cargados del API | Profesores, estudiantes, turnos libres y tipos de consulta se piden al gateway al abrir el formulario |
| Cabecera-detalle en un request | Turnos: `POST /time-slots/batch`. Reservas: `POST`/`PUT /reservations` con `details[]`. Usuarios: `POST`/`PUT /users` con `roles[]` |
| JWT + interceptor | `api.interceptors.request` agrega `Authorization: Bearer <token>`; 401 → cierra sesión y vuelve al login |
| Permisos en la UI | Menú y botones según rol (`AuthContext`), `AdminRoute` muestra 403 |
| Sesión persistente (F5) | El token sigue en `localStorage`; al recargar se valida con `GET /auth/me` |
| Redis | Prueba `deploy/smoke_test.py`: SET al crear/leer, GET desde caché, DEL al editar, TTL y que no se guardan páginas |

## Estructura

```text
src/
  app/           Router, layout, guards, puente de eventos HTTP
  features/      auth, users, availability, reservations, notifications, consultationTypes, contact, errors
  shared/api/    Cliente Axios (interceptores) y endpoints
  shared/ui/     Paginación, buscador, diálogos, ErrorBoundary
  types/         Contratos TypeScript alineados al OpenAPI
  styles/        Tailwind + componentes base
deploy/          docker-compose del stack completo, nginx, scripts up.ps1/up.sh y smoke_test.py
```

## Scripts

- `npm run dev` — desarrollo
- `npm run build` — build de producción
- `npm run lint` — oxlint
