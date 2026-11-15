# Despliegue distribuido

Arquitectura completa en **dos nodos**:
- **Nodo 1:** Windows.
- **Nodo 2:** Ubuntu en WSL. Es una máquina virtual con su propia IP; también puede ser otra PC de la red.

```
                       NODO 2 · Ubuntu (WSL)                                NODO 1 · Windows
 Navegador ──► Apache :80  (balanceador, mod_status, sticky sessions)
                 │  /            ┌─► Tomcat UI ui1 :8181 ┐ cluster (replicación
                 │  balancer ────┤                       │ de sesiones DeltaManager)
                 │               └─► Tomcat UI ui2 :8182 ┘
                 │  /api/* ─────────────────────────────────────────► API Gateway :8080
                 │                                                       │ lb:// (Eureka :8761)
                 │                                                       ▼
               Redis :6379 ◄────────── caché ──────────────── Tomcat microservicios
                                                               ├─ ms-users          :8081
                                                               ├─ ms-availability   :8082
                                                               ├─ ms-notificaciones :8083
                                                               └─ ms-reservas       :8084
                                                                       │
                                                                       ▼
                                                           PostgreSQL (Supabase, nube)
```

| Requisito | Dónde está |
|---|---|
| Balanceador Apache | `nodo2-ubuntu/reservas-balanceador.conf` (`mod_proxy_balancer`, `lbmethod=byrequests`) |
| Sticky sessions | `stickysession=JSESSIONID` + `jvmRoute="ui1"/"ui2"` en cada Tomcat |
| Monitoreo del balanceador | `mod_status` en `/server-status`, `/balancer-manager`, y `mod_proxy_hcheck` (chequeo cada 3 s) |
| Cluster de 2 Tomcat de UI | `SimpleTcpCluster` + `DeltaManager` + `<distributable/>` (`ui-war/WEB-INF/web.xml`) |
| Tomcat de microservicios | **Un** Tomcat 11 con un `<Service>` por microservicio (`nodo1-windows/instalar-tomcat-microservicios.ps1`) |
| API Gateway local | jar de `api-gateway`; también se puede correr desde IntelliJ |
| Eureka Dashboard | http://localhost:8761 |
| Redis + Redis Insight | Redis en el nodo 2; Redis Insight se conecta a `<IP nodo 2>:6379` |
| Base de datos externa | Supabase (PostgreSQL en la nube) |

## Instalación (una vez)

Todo desde PowerShell, en la carpeta `Reservas`:

```powershell
# 1. WAR de la UI (compila el frontend)
.\frontend\deploy\distribuido\construir-ui-war.ps1

# 2. Nodo 1: Tomcat de microservicios (-Build recompila los 4 WAR)
.\frontend\deploy\distribuido\nodo1-windows\instalar-tomcat-microservicios.ps1 -Build

# 3. Nodo 2: Apache + 2 Tomcat de UI + Redis
wsl -d Ubuntu -u root -- bash frontend/deploy/distribuido/nodo2-ubuntu/instalar-nodo2.sh
```

- La contraseña del **Tomcat Manager** (usuario `admin`) se genera en `infra\credenciales-tomcat.txt`, que no se sube al repo.
- Con otra PC física como nodo 2, en Linux:
  1. Copiá `frontend/deploy/distribuido` y `build/reservas-ui.war`.
  2. Ejecutá `sudo ./instalar-nodo2.sh <IP del nodo 1>`.
  3. En el nodo 1, iniciá con `iniciar-nodo1.ps1 -RedisHost <IP del nodo 2>`.

## Arranque

```powershell
.\levantar-distribuido.ps1
```

Abre **una consola por componente**:
- **Nodo 1:** `eureka-server`, `tomcat-microservicios` y `api-gateway`.
- **Nodo 2:** `tomcat-ui1` y `tomcat-ui2`.

Ctrl+C detiene el componente, y flecha arriba + Enter lo vuelve a levantar.

Los 4 microservicios tardan unos 2 minutos en desplegarse dentro de Tomcat.

| URL | Qué es |
|---|---|
| `http://<IP nodo 2>/` | **La aplicación** (siempre entrar por acá) |
| `http://<IP nodo 2>/server-status` | mod_status de Apache |
| `http://<IP nodo 2>/balancer-manager` | Estado de cada Tomcat de UI (Ok / Err) |
| http://localhost:8761 | Eureka Dashboard |
| http://localhost:8081/manager/html … 8084 | Tomcat Manager de cada microservicio |

La IP del nodo 2 la imprime el script. En WSL cambia al reiniciar la PC (`wsl hostname -I`).

## Guion de la demostración

### 1. Balanceo y sticky sessions
1. Entrá a `http://<IP nodo 2>/` e iniciá sesión.
2. Abajo a la izquierda, el recuadro **Nodo UI** muestra qué Tomcat te atiende (ui1 o ui2), el id de sesión y un contador de pedidos. Se actualiza cada 5 s y siempre muestra el mismo nodo: eso es la sticky session.
3. En DevTools → Network, cada respuesta trae la cabecera `X-UI-Node`, y la cookie `JSESSIONID` termina en `.ui1` o `.ui2`.

### 2. Tolerancia a fallos
1. Hacé **Ctrl+C** en la consola del Tomcat que te atiende (por ejemplo `tomcat-ui1`).
2. En unos segundos, el recuadro pasa a **ui2** con el **mismo id de sesión**, y el contador sigue sumando: la sesión estaba replicada. No hace falta volver a iniciar sesión.
3. En `/balancer-manager`, ui1 aparece como **Err** y ui2 como **Ok**. En `/server-status` se ven los pedidos.
4. Flecha arriba + Enter en la consola de ui1: vuelve a **Ok** solo, gracias al health check.

### 3. Eureka: alta y baja de microservicios
1. Abrí http://localhost:8761: están `ms-users:8081`, `ms-availability:8082`, `ms-notificaciones:8083`, `ms-reservas:8084` y `api-gateway:8080`.
2. Entrá a `http://localhost:8082/manager/html` y hacé **Stop** sobre `/`:
   - `MS-AVAILABILITY` desaparece de Eureka;
   - en la app, Disponibilidad muestra la página 500.
3. **Start**: vuelve a registrarse en unos segundos.

### 4. Redis Insight
1. Conectá a `<IP nodo 2>:6379`, sin contraseña.
2. Filtrá por `ms-*`: se ven las claves de los 4 microservicios (por ejemplo `ms-users:users:user:<id>`), su TTL y su valor JSON.
3. Navegá la app y mirá cómo aparecen y desaparecen las claves (pestaña **Browser**, o **Profiler** para ver los comandos en vivo).

### 5. Enrutamiento completo
En Network, un `GET /api/users` hace este recorrido:
1. Apache (nodo 2) lo reenvía al API Gateway del nodo 1.
2. El gateway valida el JWT y resuelve `lb://ms-users` en Eureka.
3. El pedido llega al Tomcat de microservicios, puerto 8081.
4. ms-users consulta Redis (nodo 2) y Supabase.

## Detalles técnicos

- **Configuración de los microservicios en Tomcat:**
  - El instalador copia el `.env` de cada servicio como `<Parameter>` en `infra\tomcat-microservicios\conf\<servicio>\localhost\ROOT.xml`.
  - Spring Boot lee esos parámetros como propiedades.
  - Tomcat arranca desde `infra\tomcat-microservicios\run` para que los cargadores de `.env` no encuentren archivos de otros servicios.
- **Logs de los microservicios:**
  - `infra\tomcat-microservicios\logs\ms-*-AAAA-MM-DD.log`;
  - consola completa en `logs\consola.log`.
- **Logs del nodo 2:**
  - Apache: `/var/log/apache2/reservas-access.log` (incluye `route=ui1|ui2` por pedido);
  - Tomcat: `/opt/reservas-ui/ui{1,2}/logs`.
- **Los microservicios siguen funcionando con `java -jar target/*.war`** (desarrollo local, Docker o `levantar-consolas.ps1`).
