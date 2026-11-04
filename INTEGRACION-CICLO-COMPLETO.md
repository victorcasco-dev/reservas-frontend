# Integrar el resto de microservicios y cerrar el ciclo (frontend)

Este documento complementa el [README](./README.md) del frontend. Asume que ya funcionan **login**, **usuarios** (`ms-users`) y **disponibilidad** (`ms-availability`) contra el gateway en `http://localhost:8080`.

El objetivo es completar el flujo de negocio:

```text
Login (JWT) → ver turnos disponibles → crear reserva (cabecera + líneas de detalle)
→ (opcional) consultar/cancelar reserva → (opcional) notificaciones / contacto
```

Los servicios que faltan viven en **`sr-microservicios-rodrigo`**:

| Servicio | Puerto default | Rutas en el gateway |
|----------|----------------|---------------------|
| `ms-reservas` | 8084 | `/reservations/**`, `/consultation-types/**` |
| `ms-notificaciones` | 8083 | `/notifications/**`, `/email-templates/**`, `/contact/**` |

Contrato compartido: [`commons/commons/src/main/resources/openapi/openapi.yaml`](../commons/commons/src/main/resources/openapi/openapi.yaml).

---

## 1. Prerrequisitos en el backend (Rodrigo + gateway)

Antes de tocar el frontend, el equipo de Rodrigo debe dejar los MS listos para el mismo JWT que emite `ms-users`. Guía paso a paso:

**[sr-microservicios-rodrigo/README.md](../sr-microservicios-rodrigo/README.md)**

Checklist mínimo:

1. Copiar `com.reservas.security` desde `ms-availability` a `ms-reservas` y `ms-notificaciones`.
2. Mismo `JWT_SECRET`, `JWT_ISSUER` y dependencias jjwt en ambos POM.
3. `SecurityConfig` + `application.yml` con `app.security` (reglas por rol).
4. En **api-gateway** `.env`, descomentar y apuntar:
   ```properties
   GATEWAY_MS_NOTIFICACIONES_URI=http://127.0.0.1:8083
   GATEWAY_MS_RESERVAS_URI=http://127.0.0.1:8084
   ```
5. En **api-gateway** `application.yml`, agregar en `app.security.rules` las mismas reglas que describe el README de Rodrigo (reservas, tipos de consulta, notificaciones, plantillas, contacto). Hoy el gateway solo exige JWT válido en esas rutas; sin reglas por rol, cualquier usuario autenticado pasa y el MS devuelve 403 si no corresponde.
6. Eureka + Postgres compartido (misma BD que users/availability) y Redis si aplica caché en el futuro.
7. Levantar stack completo: Eureka → users → availability → reservas → notificaciones → gateway.

Verificación rápida con token de admin o estudiante:

```http
GET http://localhost:8080/consultation-types
Authorization: Bearer <token>

GET http://localhost:8080/reservations
Authorization: Bearer <token>
```

---

## 2. Qué agregar en el frontend (estructura)

Seguir el mismo patrón que `users` y `availability`:

```text
src/
  types/api.ts              ← ampliar DTOs de reservas y notificaciones
  shared/api/
    reservations.ts
    consultationTypes.ts
    notifications.ts          ← opcional: admin
    contact.ts                ← opcional: formulario público (ver nota abajo)
  features/
    reservations/
      ReservationsPage.tsx    ← pantalla principal para cerrar el ciclo
    notifications/            ← opcional: admin
  app/router.tsx              ← rutas + ítems del menú
  app/layout/AppLayout.tsx
```

Reutilizar:

- Cliente Axios en `shared/api/client.ts` (ya envía `Authorization: Bearer`).
- Toasts con **Sonner** (`toast.success` / `toast.error`).
- Layout lista + formulario en una sola pantalla (como usuarios/disponibilidad).

---

## 3. Tipos TypeScript (alineados al OpenAPI)

Ampliar `src/types/api.ts` con, como mínimo:

```typescript
export type ReservationStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED'

export interface ReservationDetailCreateDto {
  consultationTypeId: string
  comment?: string
}

export interface ReservationCreateDto {
  studentId: string
  timeSlotId: string
  details: ReservationDetailCreateDto[]
}

export interface ReservationDto {
  id: string
  studentId: string
  timeSlot: TimeSlotDto
  status: ReservationStatus
  details: Array<{
    id: string
    consultationType: { id: string; name: string; description?: string; active: boolean }
    comment?: string
  }>
}

export interface ConsultationTypeDto {
  id: string
  name: string
  description?: string
  active: boolean
}
```

Ajustar paginación si el backend de Rodrigo devuelve `PageResponseDto` (`content` + metadatos) en lugar de `UserPageDto`; conviene un tipo genérico `PageResponse<T>`.

---

## 4. Capa API

### Reservas (`shared/api/reservations.ts`)

| Método | Gateway | Uso en UI |
|--------|---------|-----------|
| `GET /reservations` | Lista paginada | Panel izquierdo |
| `GET /reservations/search?...` | Filtros | Búsqueda por estudiante / estado / fechas |
| `GET /reservations/{id}` | Detalle | Editar selección |
| `POST /reservations` | Alta | Formulario (cabecera + detalle) |
| `PUT /reservations/{id}` | Cambio de turno o tipos | Edición |
| `DELETE /reservations/{id}` o `POST /reservations/{id}/cancellation` | Cancelar | Botón cancelar |

Cuerpo de alta (cabecera + detalle en **un solo POST**):

```json
{
  "studentId": "uuid-estudiante",
  "timeSlotId": "uuid-turno-disponible",
  "details": [
    { "consultationTypeId": "uuid-tipo", "comment": "Primera consulta de tesis" }
  ]
}
```

Respuesta **409** si el turno ya no está disponible: mostrar toast de error y refrescar lista de turnos.

### Tipos de consulta (`shared/api/consultationTypes.ts`)

| Método | Gateway |
|--------|---------|
| `GET /consultation-types` | Catálogo para armar filas del detalle |
| `GET /consultation-types/search` | Si hace falta filtrar en admin |

CRUD de tipos suele ser **solo administrador** (según reglas de seguridad del MS).

### Notificaciones (opcional, admin)

| Método | Gateway | Rol típico |
|--------|---------|------------|
| `GET /notifications` | Historial | `ADMINISTRATOR` |
| `POST /notifications` | Disparo manual | `ADMINISTRATOR` |
| `GET /email-templates` | Plantillas | `ADMINISTRATOR` |

### Contacto (opcional)

`POST /contact` — formulario de consulta. Hoy el gateway exige JWT en casi todo excepto `/auth/login` y docs. Si el contacto debe ser **anónimo**, hay que añadir `/contact` (solo `POST`) a `app.security.public-paths` del gateway **y** al MS de notificaciones. Si no, el formulario puede exigir login.

---

## 5. Pantalla de reservas (cerrar el ciclo)

Ruta sugerida: **`/reservations`**.

### Roles

| Rol | Qué puede hacer en UI |
|-----|------------------------|
| `STUDENT` | Ver sus reservas, crear reserva (estudiante = `userId` del token), cancelar la propia |
| `PROFESSOR` | Ver reservas filtradas por su ámbito (si el API lo permite), cancelar según reglas del MS |
| `ADMINISTRATOR` | Todo lo anterior + gestión de tipos de consulta (pantalla aparte o sección admin) |

Usar `useAuth()` → `user.userId`, `user.roles`.

### Layout (misma idea que usuarios/disponibilidad)

**Panel izquierdo — listado**

- `GET /reservations` o `/reservations/search`.
- Filtros: estado, rango de fechas, estudiante (admin).
- Cada fila: fecha/hora del `timeSlot`, estado, cantidad de tipos en `details`.

**Panel derecho — formulario en una sola pantalla**

1. **Bloque superior (datos de la reserva)**  
   - Estudiante: select o fijo con el `userId` del token si es `STUDENT`.  
   - Turno: select alimentado con `GET /time-slots?status=AVAILABLE` (solo turnos libres). Mostrar profesor, fecha, hora.  
   - Al elegir turno, guardar `timeSlotId`.

2. **Bloque inferior (líneas de detalle)**  
   - Tabla editable: tipo de consulta (`consultationTypeId` desde `GET /consultation-types`) + comentario opcional.  
   - Botón “Agregar línea” (mínimo una línea; el OpenAPI exige `details` con `minItems: 1`).  
   - Enviar con `POST /reservations` o `PUT /reservations/{id}` en edición.

3. **Acciones**  
   - Guardar → toast éxito y refrescar listado.  
   - Cancelar reserva → `DELETE` o `POST .../cancellation` + toast.

### Datos cruzados entre MS

- Turnos: **`ms-availability`** (`/time-slots`).
- Reserva y tipos: **`ms-reservas`** (`/reservations`, `/consultation-types`).
- Tras crear reserva, el MS de reservas marca el turno como reservado en la BD compartida; la lista de disponibilidad debería mostrar el turno como `BOOKED` al refrescar.

Flujo manual de prueba del ciclo:

1. Admin: profesor + turnos en **Disponibilidad**.  
2. Admin: tipos de consulta en **ms-reservas** (Swagger o futura pantalla admin).  
3. Estudiante: login → **Reservas** → elegir turno + al menos un tipo → guardar.  
4. Ver turno `BOOKED` en disponibilidad y reserva en listado.  
5. Cancelar reserva → turno vuelve a `AVAILABLE` (comportamiento esperado según tests de `ms-reservas`).

---

## 6. Router y menú

En `app/router.tsx`:

```tsx
<Route path="reservations" element={<ReservationsPage />} />
// opcional:
<Route path="notifications" element={<AdminRoute><NotificationsPage /></AdminRoute>} />
```

En `AppLayout.tsx`, enlace “Reservas” visible para `STUDENT`, `PROFESSOR` y `ADMINISTRATOR` (`isAuthenticated` basta si el MS filtra).

Proteger rutas admin de notificaciones/plantillas con el mismo `AdminRoute` que `/users`.

---

## 7. Swagger agregado en el gateway

Para probar contratos mientras desarrollás:

- http://localhost:8080/swagger-ui.html  
- Elegir **ms-reservas** o **ms-notificaciones** en el desplegable.

OpenAPI del gateway:

- `/v3/api-docs/ms-reservas`
- `/v3/api-docs/ms-notificaciones`

---

## 8. Variables de entorno

Frontend (sin cambios si ya usás proxy):

```properties
VITE_API_BASE_URL=/api
```

Backend Rodrigo (ejemplo en cada `.env`):

- Mismo `JWT_*` que `ms-users`.
- `SERVER_PORT=8083` / `8084`.
- `EUREKA_URL`, credenciales `DB_*` al pooler Postgres del proyecto.

---

## 9. Checklist de integración frontend

- [ ] Backend Rodrigo con JWT operativo (README de `sr-microservicios-rodrigo`).
- [ ] Gateway con URIs 8083/8084 y reglas de rol alineadas.
- [ ] Tipos + módulos `shared/api` para reservas y tipos de consulta.
- [ ] Pantalla `/reservations` (lista + formulario cabecera/detalle).
- [ ] Manejo de 401/403/409 con toasts.
- [ ] Prueba estudiante: reservar turno disponible.
- [ ] Prueba cancelación y refresco de disponibilidad.
- [ ] (Opcional) Pantallas admin: tipos de consulta, notificaciones, plantillas.
- [ ] (Opcional) `POST /contact` público o autenticado según decisión de producto.

---

## 10. Orden recomendado de implementación

1. **Solo lectura**: listar reservas y tipos de consulta (validar gateway + token).  
2. **Alta de reserva**: formulario completo + un estudiante de prueba.  
3. **Cancelación** y estados en UI (badges como en turnos).  
4. **Filtros** en listado (`/reservations/search`).  
5. **Notificaciones / contacto** si el alcance del entregable lo incluye.

Con eso el frontend cubre el ciclo completo de tutorías sobre el stack actual sin cambiar la arquitectura (un solo gateway, un solo login, JWT en cada MS).
