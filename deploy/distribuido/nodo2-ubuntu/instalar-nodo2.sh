#!/usr/bin/env bash
# Nodo 2 (Ubuntu / WSL): Apache balanceador + 2 Tomcat de UI en cluster + Redis.
#
#   sudo ./instalar-nodo2.sh [IP_DEL_NODO_1]
#
# IP_DEL_NODO_1 es la máquina donde corre el API Gateway (puerto 8080). En WSL se detecta sola
# (la IP de Windows vista desde Ubuntu). Con otra PC física, pasá su IP en la red local.
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
DIST="$(cd "$DIR/.." && pwd)"                      # frontend/deploy/distribuido
RESERVAS="$(cd "$DIST/../../.." && pwd)"           # carpeta Reservas
TOMCAT_VERSION=11.0.29
TOMCAT_HOME=/opt/tomcat
UI_BASE=/opt/reservas-ui
WAR="$DIST/build/reservas-ui.war"
NODE1_IP="${1:-$(ip route | awk '/^default/ {print $3; exit}')}"

[ "$(id -u)" -eq 0 ] || { echo "Ejecutalo con sudo"; exit 1; }
[ -f "$WAR" ] || { echo "Falta $WAR: ejecutá construir-ui-war.ps1 en Windows"; exit 1; }

echo "== Nodo 1 (API Gateway): $NODE1_IP:8080"

# ---------- Paquetes ----------
need=()
command -v apache2 >/dev/null || need+=(apache2)
command -v java >/dev/null || need+=(openjdk-21-jre-headless)
command -v redis-server >/dev/null || need+=(redis-server)
if [ ${#need[@]} -gt 0 ]; then
  apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${need[@]}"
fi

# ---------- Tomcat (CATALINA_HOME compartido) ----------
if [ ! -x "$TOMCAT_HOME/bin/catalina.sh" ]; then
  tgz="$RESERVAS/infra/downloads/apache-tomcat-$TOMCAT_VERSION.tar.gz"
  if [ ! -f "$tgz" ]; then
    tgz=/tmp/apache-tomcat-$TOMCAT_VERSION.tar.gz
    curl -fsSL -o "$tgz" "https://dlcdn.apache.org/tomcat/tomcat-11/v$TOMCAT_VERSION/bin/apache-tomcat-$TOMCAT_VERSION.tar.gz"
  fi
  mkdir -p "$TOMCAT_HOME"
  tar -xzf "$tgz" -C "$TOMCAT_HOME" --strip-components=1
  rm -rf "$TOMCAT_HOME"/webapps/{docs,examples,ROOT}
fi

MANAGER_PWD="$(grep -oP '(?<=contraseña: ).*' "$RESERVAS/infra/credenciales-tomcat.txt" 2>/dev/null | tr -d '\r' || true)"
MANAGER_PWD="${MANAGER_PWD:-$(head -c 12 /dev/urandom | base64 | tr -dc A-Za-z0-9)}"

# ---------- Dos instancias (CATALINA_BASE) en cluster ----------
#            nombre  http  shutdown  cluster
for spec in "ui1 8181 8015 4001" "ui2 8182 8025 4002"; do
  read -r name http shutdown tribes <<<"$spec"
  base="$UI_BASE/$name"
  if [ "$name" = ui1 ]; then peer_port=4002; peer_id=2; my_id=1; else peer_port=4001; peer_id=1; my_id=2; fi
  mkdir -p "$base"/{conf,logs,temp,work,webapps,bin}
  cp -n "$TOMCAT_HOME"/conf/{catalina.policy,catalina.properties,context.xml,logging.properties,web.xml,jaspic-providers.xml} "$base/conf/" 2>/dev/null || true

  cat > "$base/conf/server.xml" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<!-- Tomcat de UI "$name" (generado por instalar-nodo2.sh) -->
<Server port="$shutdown" shutdown="SHUTDOWN">
  <Listener className="org.apache.catalina.startup.VersionLoggerListener" />
  <Listener className="org.apache.catalina.core.JreMemoryLeakPreventionListener" />
  <Listener className="org.apache.catalina.mbeans.GlobalResourcesLifecycleListener" />
  <Listener className="org.apache.catalina.core.ThreadLocalLeakPreventionListener" />
  <GlobalNamingResources>
    <Resource name="UserDatabase" auth="Container" type="org.apache.catalina.UserDatabase"
              factory="org.apache.catalina.users.MemoryUserDatabaseFactory" pathname="conf/tomcat-users.xml" />
  </GlobalNamingResources>
  <Service name="Catalina">
    <Connector port="$http" protocol="HTTP/1.1" connectionTimeout="20000" />
    <!-- jvmRoute: sufijo de JSESSIONID (ABC123.$name) que Apache usa para las sticky sessions -->
    <Engine name="Catalina" defaultHost="localhost" jvmRoute="$name">

      <!-- Cluster: replica las sesiones HTTP con el otro Tomcat de UI (membresía estática) -->
      <Cluster className="org.apache.catalina.ha.tcp.SimpleTcpCluster" channelSendOptions="8">
        <Manager className="org.apache.catalina.ha.session.DeltaManager"
                 expireSessionsOnShutdown="false" notifyListenersOnReplication="true"
                 stateTransferTimeout="10" />
        <Channel className="org.apache.catalina.tribes.group.GroupChannel">
          <Membership className="org.apache.catalina.tribes.membership.StaticMembershipService">
            <LocalMember className="org.apache.catalina.tribes.membership.StaticMember"
                         domain="reservas-ui" uniqueId="{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,$my_id}" />
            <Member className="org.apache.catalina.tribes.membership.StaticMember"
                    host="127.0.0.1" port="$peer_port" domain="reservas-ui"
                    uniqueId="{0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,$peer_id}" />
          </Membership>
          <Receiver className="org.apache.catalina.tribes.transport.nio.NioReceiver"
                    address="127.0.0.1" port="$tribes" autoBind="0" selectorTimeout="5000" maxThreads="6" />
          <Sender className="org.apache.catalina.tribes.transport.ReplicationTransmitter">
            <Transport className="org.apache.catalina.tribes.transport.nio.PooledParallelSender" />
          </Sender>
          <Interceptor className="org.apache.catalina.tribes.group.interceptors.TcpPingInterceptor" staticOnly="true" />
          <Interceptor className="org.apache.catalina.tribes.group.interceptors.TcpFailureDetector" />
          <Interceptor className="org.apache.catalina.tribes.group.interceptors.MessageDispatchInterceptor" />
        </Channel>
        <Valve className="org.apache.catalina.ha.tcp.ReplicationValve"
               filter=".*\.(gif|js|jpeg|jpg|png|htm|html|css|txt|svg|ico|woff2?)" />
        <!-- Si llega una sesión de ui1 a ui2 (failover), reescribe el sufijo para que siga pegada a ui2 -->
        <Valve className="org.apache.catalina.ha.session.JvmRouteBinderValve" />
        <ClusterListener className="org.apache.catalina.ha.session.ClusterSessionListener" />
      </Cluster>

      <Realm className="org.apache.catalina.realm.LockOutRealm">
        <Realm className="org.apache.catalina.realm.UserDatabaseRealm" resourceName="UserDatabase" />
      </Realm>
      <Host name="localhost" appBase="webapps" unpackWARs="true" autoDeploy="true">
        <Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs"
               prefix="access" suffix=".log" pattern="%h %t &quot;%r&quot; %s %b %{JSESSIONID}c" />
      </Host>
    </Engine>
  </Service>
</Server>
XML

  cat > "$base/conf/tomcat-users.xml" <<XML
<?xml version="1.0" encoding="UTF-8"?>
<tomcat-users xmlns="http://tomcat.apache.org/xml" version="1.0">
  <role rolename="manager-gui"/>
  <user username="admin" password="$MANAGER_PWD" roles="manager-gui"/>
</tomcat-users>
XML
  mkdir -p "$base/conf/Catalina/localhost"
  cat > "$base/conf/Catalina/localhost/manager.xml" <<XML
<Context docBase="$TOMCAT_HOME/webapps/manager" privileged="true" antiResourceLocking="false" />
XML

  cat > "$base/bin/setenv.sh" <<SH
export JAVA_OPTS="-Xms128m -Xmx512m -Dui.node=$name -Djava.net.preferIPv4Stack=true"
SH

  rm -rf "$base/webapps/ROOT" "$base/webapps/ROOT.war"
  cp "$WAR" "$base/webapps/ROOT.war"
  echo "== $name: http://localhost:$http  (cluster en 127.0.0.1:$tribes)"
done

# ---------- Apache: balanceador ----------
a2enmod -q proxy proxy_http proxy_balancer lbmethod_byrequests slotmem_shm proxy_hcheck status headers >/dev/null
sed "s/@NODE1_IP@/$NODE1_IP/g" "$DIR/reservas-balanceador.conf" > /etc/apache2/sites-available/reservas-balanceador.conf
a2dissite -q 000-default >/dev/null 2>&1 || true
a2ensite -q reservas-balanceador >/dev/null
apache2ctl configtest
systemctl restart apache2 2>/dev/null || service apache2 restart

# ---------- Redis accesible desde el nodo 1 ----------
# Escucha en todas las interfaces de la red interna de WSL para que los microservicios
# del nodo 1 lo usen por IP. Sin contraseña, igual que en desarrollo.
sed -i -E 's/^bind .*/bind 0.0.0.0 -::*/; s/^protected-mode .*/protected-mode no/' /etc/redis/redis.conf
systemctl restart redis-server 2>/dev/null || service redis-server restart

IP2="$(hostname -I | awk '{print $1}')"
cat <<TXT

Nodo 2 listo (IP $IP2).
  Balanceador:       http://$IP2/
  Estado (mod_status): http://$IP2/server-status
  Balancer manager:  http://$IP2/balancer-manager
  Redis:             $IP2:6379
Iniciá los Tomcat de UI con iniciar-nodo2.ps1 (Windows) o:
  CATALINA_BASE=$UI_BASE/ui1 $TOMCAT_HOME/bin/catalina.sh run
TXT
