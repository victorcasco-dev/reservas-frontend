#!/usr/bin/env python3
"""Prueba de humo del stack completo, siempre a través del API Gateway.

Uso:  python deploy/smoke_test.py [--gateway http://localhost:8080] [--frontend http://localhost:5173]

Crea datos de prueba (turnos, una reserva, un usuario) y al final los cancela/desactiva.
Verifica seguridad (401/403), DTOs compuestos, búsqueda/paginación y la caché en Redis
(SET al crear/consultar, GET desde caché, DEL al modificar), usando redis-cli del contenedor.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
import uuid

RESULTS: list[tuple[bool, str]] = []


def check(ok: bool, label: str, detail: str = "") -> bool:
    RESULTS.append((ok, label))
    mark = "OK  " if ok else "FAIL"
    print(f"[{mark}] {label}" + (f"  -> {detail}" if detail and not ok else ""))
    return ok


class Api:
    def __init__(self, base: str):
        self.base = base.rstrip("/")
        self.token: str | None = None

    def call(self, method: str, path: str, body=None, auth: bool = True):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, method=method)
        req.add_header("Accept", "application/json")
        if body is not None:
            req.add_header("Content-Type", "application/json")
        if auth and self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                raw = res.read().decode() or "null"
                return res.status, json.loads(raw) if raw.strip() else None
        except urllib.error.HTTPError as err:
            raw = err.read().decode()
            try:
                return err.code, json.loads(raw)
            except ValueError:
                return err.code, raw


def redis(*args: str) -> str:
    container = os.environ.get("REDIS_CONTAINER", "reservas-redis-1")
    out = subprocess.run(["docker", "exec", container, "redis-cli", *args],
                         capture_output=True, text=True, timeout=20)
    return out.stdout.strip()


def redis_keys(pattern: str) -> list[str]:
    return [k for k in redis("--scan", "--pattern", pattern).splitlines() if k]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gateway", default="http://localhost:8080")
    parser.add_argument("--frontend", default="http://localhost:5173")
    parser.add_argument("--email", default=os.environ.get("ADMIN_EMAIL", "admin@reservas.local"))
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", "ChangeMe123!"))
    args = parser.parse_args()

    api = Api(args.gateway)

    # ---------- Seguridad ----------
    status, _ = api.call("GET", "/users", auth=False)
    check(status == 401, "Sin token, el gateway responde 401", str(status))
    api.token = "abc.def.ghi"
    status, _ = api.call("GET", "/users")
    check(status == 401, "Token inválido -> 401", str(status))
    api.token = None

    status, body = api.call("POST", "/auth/login", {"email": args.email, "password": "mal-password"})
    check(status == 401, "Login con contraseña incorrecta -> 401", str(status))
    status, body = api.call("POST", "/auth/login", {"email": args.email, "password": args.password})
    if not check(status == 200 and body and body.get("accessToken"), "Login admin emite JWT", str(body)[:200]):
        return summary()
    api.token = body["accessToken"]
    check("ADMINISTRATOR" in body.get("roles", []), "El token trae el rol ADMINISTRATOR")

    status, me = api.call("GET", "/auth/me")
    check(status == 200 and me.get("email") == args.email, "GET /auth/me con Bearer", str(me)[:200])

    # ---------- Listados paginados + búsqueda ----------
    for path in ["/users?page=0&size=5", "/users?q=admin&page=0&size=5", "/professors?page=0&size=5",
                 "/time-slots?page=0&size=5", "/time-slots?q=a&page=0&size=5",
                 "/consultation-types?page=0&size=5", "/reservations/search?page=0&size=5",
                 "/reservations/search?q=a&page=0&size=5", "/notifications/search?page=0&size=5",
                 "/notifications/search?q=a&page=0&size=5", "/email-templates/search?page=0&size=5"]:
        status, page = api.call("GET", path)
        ok = status == 200 and isinstance(page, dict) and "content" in page
        check(ok, f"GET {path} paginado", f"{status} {str(page)[:200]}")

    # ---------- Formulario público ----------
    saved = api.token
    api.token = None
    status, body = api.call("POST", "/contact", {"name": "Smoke Test", "email": "smoke@example.com",
                                                 "message": "Mensaje de prueba automatizada"})
    check(status == 201, "POST /contact público (sin token) -> 201", f"{status} {str(body)[:200]}")
    status, _ = api.call("GET", "/contact", auth=False)
    check(status == 401, "GET /contact sin token -> 401", str(status))
    api.token = saved

    # ---------- Usuarios: alta con roles en un solo request ----------
    suffix = uuid.uuid4().hex[:8]
    student_email = f"smoke.{suffix}@example.com"
    status, student = api.call("POST", "/users", {
        "email": student_email, "password": "Smoke1234!", "firstName": "Smoke", "lastName": f"Student{suffix}",
        "type": "STUDENT", "studentCode": f"S-{suffix}", "roles": ["STUDENT", "PROFESSOR"]})
    check(status == 201, "POST /users con roles en el DTO (una sola petición)", f"{status} {str(student)[:200]}")
    student_id = student.get("id") if isinstance(student, dict) else None
    if student_id:
        status, roles = api.call("GET", f"/users/{student_id}/roles")
        check(status == 200 and sorted(roles) == ["PROFESSOR", "STUDENT"], "Roles guardados con el alta", str(roles))

        # Autorización: el estudiante no puede administrar usuarios
        st_api = Api(args.gateway)
        status, body = st_api.call("POST", "/auth/login", {"email": student_email, "password": "Smoke1234!"})
        if check(status == 200, "Login del usuario recién creado", str(status)):
            st_api.token = body["accessToken"]
            status, _ = st_api.call("GET", "/users")
            check(status == 403, "Estudiante en /users -> 403", str(status))
            status, _ = st_api.call("GET", "/notifications/search")
            check(status == 403, "Estudiante en /notifications -> 403", str(status))

    # ---------- Disponibilidad: cabecera-detalle en una sola petición ----------
    status, profs = api.call("GET", "/professors?page=0&size=1&active=true")
    prof = (profs or {}).get("content", [None])[0] if status == 200 else None
    slot_ids: list[str] = []
    if check(prof is not None, "Hay al menos un profesor activo"):
        day = (dt.date.today() + dt.timedelta(days=20 + int(suffix[:2], 16) % 60)).isoformat()
        minute = int(suffix[2:4], 16) % 4 * 15
        status, created = api.call("POST", "/time-slots/batch", {
            "professorId": prof["id"], "slotDate": day,
            "slots": [{"startTime": f"07:{minute:02d}", "endTime": f"07:{minute + 10:02d}"},
                      {"startTime": f"21:{minute:02d}", "endTime": f"21:{minute + 10:02d}"}]})
        ok = status == 201 and isinstance(created, list) and len(created) == 2
        check(ok, "POST /time-slots/batch crea 2 franjas en un request", f"{status} {str(created)[:300]}")
        if ok:
            slot_ids = [s["id"] for s in created]
            check(all(s.get("professorName") for s in created), "TimeSlotDto trae professorName")
            key = f"ms-availability:timeSlots:time-slot:{slot_ids[0]}"
            check(redis("EXISTS", key) == "1", "Redis SET: franja creada guardada en caché", key)
            ttl = int(redis("TTL", key) or -2)
            check(ttl > 0, "La clave de la franja tiene TTL", str(ttl))

    # ---------- Reservas: DTO compuesto (cabecera + detalles) ----------
    status, types = api.call("GET", "/consultation-types?page=0&size=10")
    active = [t for t in (types or {}).get("content", []) if t.get("active")]
    reservation_id = None
    if slot_ids and student_id and check(bool(active), "Hay tipos de consulta activos"):
        body = {"studentId": student_id, "timeSlotId": slot_ids[1], "details": [
            {"consultationTypeId": active[0]["id"], "comment": "Detalle 1"},
            *([{"consultationTypeId": active[1]["id"], "comment": "Detalle 2"}] if len(active) > 1 else [])]}
        status, res = api.call("POST", "/reservations", body)
        ok = status == 201 and isinstance(res, dict)
        check(ok, "POST /reservations con cabecera + detalles en un request", f"{status} {str(res)[:300]}")
        if ok:
            reservation_id = res["id"]
            check(res.get("studentName", "").startswith("Smoke"), "ReservationDto trae studentName", str(res.get("studentName")))
            check(len(res.get("details", [])) == len(body["details"]), "Se guardaron todos los detalles")
            api.call("GET", f"/reservations/{reservation_id}")
            key = f"ms-reservas:reservations::{reservation_id}"
            keys = redis_keys(f"ms-reservas:reservations:*{reservation_id}")
            check(bool(keys), "Redis SET: reserva consultada queda en caché", key)
            status, again = api.call("GET", f"/reservations/{reservation_id}")
            check(status == 200 and again["id"] == reservation_id, "Redis GET: segunda lectura responde OK")
            # Editar: cambiar los detalles (PUT con el mismo DTO compuesto)
            body["details"] = [{"consultationTypeId": active[0]["id"], "comment": "Editado"}]
            status, upd = api.call("PUT", f"/reservations/{reservation_id}", body)
            check(status == 200 and len(upd.get("details", [])) == 1, "PUT /reservations edita cabecera-detalle", f"{status} {str(upd)[:200]}")
            check(not redis_keys(f"ms-reservas:reservations:*{reservation_id}"), "Redis DEL: editar invalida la clave")
            status, canc = api.call("POST", f"/reservations/{reservation_id}/cancellation")
            check(status == 200 and canc.get("status") == "CANCELLED", "Cancelar reserva", f"{status} {str(canc)[:200]}")

    # ---------- Listados: Redis no guarda la página completa ----------
    api.call("GET", "/time-slots?page=0&size=5")
    page_keys = [k for k in redis_keys("*") if "page" in k.lower() or "search" in k.lower() or "list" in k.lower()]
    check(not page_keys, "Redis no guarda colecciones/páginas completas", str(page_keys[:5]))

    # ---------- Limpieza ----------
    for sid in slot_ids:
        status, _ = api.call("DELETE", f"/time-slots/{sid}")
        check(status in (200, 204), f"Cancelar franja de prueba {sid[:8]}", str(status))
        check(redis("EXISTS", f"ms-availability:timeSlots:time-slot:{sid}") == "0", "Redis DEL al cancelar la franja")
    if student_id:
        status, _ = api.call("DELETE", f"/users/{student_id}")
        check(status in (200, 204), "Desactivar usuario de prueba", str(status))

    # ---------- Errores amigables / SPA ----------
    status, _ = api.call("GET", "/no-existe-esta-ruta")
    check(status in (401, 404), "Ruta inexistente en el gateway no devuelve 500", str(status))
    try:
        with urllib.request.urlopen(args.frontend.rstrip("/") + "/ruta/que/no/existe", timeout=10) as res:
            html = res.read().decode()
            check(res.status == 200 and 'id="root"' in html, "Frontend sirve la SPA en rutas desconocidas (404 propio)")
        with urllib.request.urlopen(args.frontend.rstrip("/") + "/api/v3/api-docs/ms-users", timeout=20) as res:
            check(res.status == 200, "Frontend -> /api proxy -> gateway")
    except Exception as exc:  # noqa: BLE001
        check(False, "Frontend accesible", str(exc))

    return summary()


def summary() -> int:
    failed = [label for ok, label in RESULTS if not ok]
    print(f"\n{len(RESULTS) - len(failed)}/{len(RESULTS)} verificaciones OK")
    for label in failed:
        print(f"  - FALLÓ: {label}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
