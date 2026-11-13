#!/usr/bin/env bash
# Levanta todo el sistema de Reservas con un solo comando (Linux / macOS / Git Bash).
#   ./deploy/up.sh            construye y levanta
#   ./deploy/up.sh --pull     git pull de cada repo antes
#   ./deploy/up.sh --rebuild  reconstruye imágenes sin caché
#   ./deploy/up.sh --test     corre la prueba de humo al final
#   ./deploy/up.sh --down     detiene todo
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$(cd "$DEPLOY_DIR/../.." && pwd)"
COMPOSE=(docker compose -f "$DEPLOY_DIR/docker-compose.yml" --env-file "$DEPLOY_DIR/.env")
PULL=0; REBUILD=0; TEST=0; DOWN=0
for arg in "$@"; do
  case "$arg" in
    --pull) PULL=1 ;; --rebuild) REBUILD=1 ;; --test) TEST=1 ;; --down) DOWN=1 ;;
    *) echo "Opción desconocida: $arg" >&2; exit 2 ;;
  esac
done

docker info >/dev/null 2>&1 || { echo "Docker no está corriendo." >&2; exit 1; }

if [ "$DOWN" = 1 ]; then "${COMPOSE[@]}" down; exit 0; fi

for repo in eureka-server api-gateway commons/commons ms-users ms-availability sr-microservicios-rodrigo frontend; do
  [ -d "$WORKSPACE/$repo" ] || { echo "Falta el repo '$repo' en $WORKSPACE" >&2; exit 1; }
  if [ "$PULL" = 1 ]; then echo "git pull $repo"; git -C "$WORKSPACE/$repo" pull --ff-only; fi
done

if [ ! -f "$DEPLOY_DIR/.env" ]; then
  cp "$DEPLOY_DIR/.env.example" "$DEPLOY_DIR/.env"
  if [ -f "$WORKSPACE/ms-users/.env" ]; then
    while IFS='=' read -r key value; do
      case "$key" in DB_URL|DB_USERNAME|DB_PASSWORD|JWT_SECRET)
        grep -v "^$key=" "$DEPLOY_DIR/.env" > "$DEPLOY_DIR/.env.tmp" || true
        echo "$key=$value" >> "$DEPLOY_DIR/.env.tmp"
        mv "$DEPLOY_DIR/.env.tmp" "$DEPLOY_DIR/.env" ;;
      esac
    done < "$WORKSPACE/ms-users/.env"
    echo "deploy/.env creado con las credenciales de ms-users/.env"
  else
    echo "Se creó deploy/.env desde el ejemplo: completá DB_* y JWT_SECRET y volvé a ejecutar." >&2
    exit 1
  fi
fi

set -a; . "$DEPLOY_DIR/.env"; set +a
GATEWAY="http://localhost:${GATEWAY_PORT:-8080}"

[ "$REBUILD" = 1 ] && "${COMPOSE[@]}" build --no-cache
"${COMPOSE[@]}" up -d --build

echo "Esperando a que el gateway encuentre los 4 microservicios..."
for _ in $(seq 1 100); do
  apps=$(curl -s -H 'Accept: application/json' "http://localhost:${EUREKA_PORT:-8761}/eureka/apps" || true)
  if echo "$apps" | grep -q MS-USERS && echo "$apps" | grep -q MS-AVAILABILITY \
     && echo "$apps" | grep -q MS-RESERVAS && echo "$apps" | grep -q MS-NOTIFICACIONES; then
    code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$GATEWAY/auth/login" \
      -H 'Content-Type: application/json' -d '{"email":"ping@example.com","password":"x"}' || true)
    if [ "$code" = 401 ] || [ "$code" = 400 ]; then break; fi
  fi
  sleep 3
done
sleep 8

cat <<INFO

Stack listo:
  Frontend       http://localhost:${FRONTEND_PORT:-5173}
  API Gateway    $GATEWAY   (Swagger: $GATEWAY/swagger-ui.html)
  Eureka         http://localhost:${EUREKA_PORT:-8761}
  Redis Insight  http://localhost:${REDIS_INSIGHT_PORT:-5540}   (base: redis:6379)
  Logs           docker compose -f deploy/docker-compose.yml logs -f ms-reservas
INFO

if [ "$TEST" = 1 ]; then
  python3 "$DEPLOY_DIR/smoke_test.py" --gateway "$GATEWAY" --frontend "http://localhost:${FRONTEND_PORT:-5173}" \
    || python "$DEPLOY_DIR/smoke_test.py" --gateway "$GATEWAY" --frontend "http://localhost:${FRONTEND_PORT:-5173}"
fi
