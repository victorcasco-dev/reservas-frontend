# Frontend Reservas (React + Vite)

Interfaz para el sistema de tutorías. Consume el **API gateway** (`http://localhost:8080`) con JWT.

## Requisitos

- Node 20+
- Gateway, Eureka, `ms-users` y `ms-availability` en ejecución
- Redis (caché del backend)

## Arranque

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Abrí http://localhost:5173. En desarrollo las peticiones van a `/api/*` y Vite las proxyea al gateway (ver `vite.config.ts`).

Producción: definí `VITE_API_BASE_URL` con la URL pública del gateway.

## Pantallas

| Ruta | Rol | Descripción |
|------|-----|-------------|
| `/login` | Público | Login contra `POST /auth/login` |
| `/availability` | Autenticado | Listado + formulario cabecera/detalle de turnos |
| `/users` | `ADMINISTRATOR` | Listado + formulario cabecera/detalle de usuarios y roles |

Usuario de prueba (bootstrap de ms-users): `admin@reservas.local` / `ChangeMe123!`

## Estructura

```
src/
  app/           Router, layout, guards
  features/      auth, users, availability
  shared/api/    Cliente Axios y endpoints
  types/         Contratos TypeScript alineados al OpenAPI
  styles/        Estilos globales
```

## Scripts

- `npm run dev` — desarrollo
- `npm run build` — build de producción
- `npm run preview` — preview del build

## Siguiente paso: reservas y notificaciones

Para integrar `ms-reservas` y `ms-notificaciones` (Rodrigo) y cerrar el flujo reserva → turno → tipos de consulta, ver **[INTEGRACION-CICLO-COMPLETO.md](./INTEGRACION-CICLO-COMPLETO.md)**.
