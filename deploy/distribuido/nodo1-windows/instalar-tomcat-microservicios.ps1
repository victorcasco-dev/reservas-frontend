# Nodo 1 (Windows): instala y configura UN Tomcat 11 que aloja los 4 microservicios.
#
# Cada microservicio es un <Service> de Tomcat con su propio conector (8081-8084) y se despliega
# como ROOT.war. Así el API Gateway y Eureka no cambian: siguen viendo ms-users:8081, etc.
# La configuración de cada servicio (.env) se copia como parámetros de contexto de Tomcat
# (conf/<servicio>/localhost/ROOT.xml), que Spring Boot lee como propiedades.
#
# Uso:  powershell -ExecutionPolicy Bypass -File instalar-tomcat-microservicios.ps1 [-Build]
#   -Build  recompila los WAR antes de desplegar.

param([switch]$Build)

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path          # carpeta Reservas
$Infra = Join-Path $Root 'infra'
$TomcatVersion = '11.0.29'
$Zip = Join-Path $Infra "downloads\apache-tomcat-$TomcatVersion-windows-x64.zip"
$Home_ = Join-Path $Infra 'tomcat-microservicios'
$JavaHome = 'C:\Program Files\Java\jdk-25'

$Services = @(
    @{ Name = 'ms-users';          Port = 8081; Dir = 'ms-users';        Label = 'ms-users · Usuarios, roles y autenticación (JWT)' },
    @{ Name = 'ms-availability';   Port = 8082; Dir = 'ms-availability'; Label = 'ms-availability · Disponibilidad de turnos' },
    @{ Name = 'ms-notificaciones'; Port = 8083; Dir = 'sr-microservicios-rodrigo\ms-notificaciones'; Label = 'ms-notificaciones · Correos, plantillas y contacto' },
    @{ Name = 'ms-reservas';       Port = 8084; Dir = 'sr-microservicios-rodrigo\ms-reservas';       Label = 'ms-reservas · Reservas y tipos de consulta' }
)

function Escape-Xml([string]$s) { [System.Security.SecurityElement]::Escape($s) }

# ---------- 1. Descarga / extracción ----------
if (-not (Test-Path "$Home_\bin\catalina.bat")) {
    if (-not (Test-Path $Zip)) {
        New-Item -ItemType Directory -Force (Split-Path $Zip) | Out-Null
        $url = "https://dlcdn.apache.org/tomcat/tomcat-11/v$TomcatVersion/bin/apache-tomcat-$TomcatVersion-windows-x64.zip"
        Write-Host "Descargando $url"
        Invoke-WebRequest $url -OutFile $Zip -UseBasicParsing
    }
    $tmp = Join-Path $Infra 'tmp-tomcat'
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
    Expand-Archive $Zip $tmp
    Move-Item (Join-Path $tmp "apache-tomcat-$TomcatVersion") $Home_
    Remove-Item $tmp -Recurse -Force
    # Apps de ejemplo que no se usan
    'docs', 'examples', 'ROOT' | % { Remove-Item "$Home_\webapps\$_" -Recurse -Force -ErrorAction SilentlyContinue }
    Write-Host "Tomcat $TomcatVersion extraído en $Home_"
}

# ---------- 2. Compilar WAR (opcional) ----------
if ($Build) {
    foreach ($s in $Services) {
        Push-Location (Join-Path $Root $s.Dir)
        & .\mvnw.cmd -q clean package -DskipTests
        if ($LASTEXITCODE) { throw "Falló la compilación de $($s.Name)" }
        Pop-Location
    }
}

# ---------- 3. Usuario del Manager ----------
$credFile = Join-Path $Infra 'credenciales-tomcat.txt'
if (-not (Test-Path $credFile)) {
    $pwd_ = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 16 | % { [char]$_ })
    "Tomcat Manager (nodo 1 y nodo 2)`r`nusuario: admin`r`ncontraseña: $pwd_" | Set-Content $credFile -Encoding UTF8
}
$managerPwd = ((Get-Content $credFile | ? { $_ -like 'contraseña:*' }) -replace 'contraseña:\s*', '').Trim()
@"
<?xml version="1.0" encoding="UTF-8"?>
<tomcat-users xmlns="http://tomcat.apache.org/xml" version="1.0">
  <role rolename="manager-gui"/>
  <role rolename="manager-status"/>
  <role rolename="manager-script"/>
  <user username="admin" password="$(Escape-Xml $managerPwd)" roles="manager-gui,manager-status,manager-script"/>
</tomcat-users>
"@ | Set-Content "$Home_\conf\tomcat-users.xml" -Encoding UTF8

# ---------- 4. server.xml: un <Service> por microservicio ----------
$servicesXml = foreach ($s in $Services) {
@"

  <!-- $($s.Name): http://localhost:$($s.Port)/  (Manager: http://localhost:$($s.Port)/manager/html) -->
  <Service name="$($s.Name)">
    <Connector port="$($s.Port)" protocol="HTTP/1.1" connectionTimeout="20000" maxThreads="100" />
    <Engine name="$($s.Name)" defaultHost="localhost">
      <Realm className="org.apache.catalina.realm.LockOutRealm">
        <Realm className="org.apache.catalina.realm.UserDatabaseRealm" resourceName="UserDatabase"/>
      </Realm>
      <Host name="localhost" appBase="webapps-$($s.Name)" unpackWARs="true" autoDeploy="false">
        <Valve className="org.apache.catalina.valves.AccessLogValve" directory="logs"
               prefix="$($s.Name)_access" suffix=".log" pattern="%h %t &quot;%r&quot; %s %b %Dms" />
      </Host>
    </Engine>
  </Service>
"@
}
@"
<?xml version="1.0" encoding="UTF-8"?>
<!-- Generado por instalar-tomcat-microservicios.ps1: Tomcat único que aloja todos los microservicios. -->
<Server port="8005" shutdown="SHUTDOWN">
  <Listener className="org.apache.catalina.startup.VersionLoggerListener" />
  <Listener className="org.apache.catalina.core.AprLifecycleListener" />
  <Listener className="org.apache.catalina.core.JreMemoryLeakPreventionListener" />
  <Listener className="org.apache.catalina.mbeans.GlobalResourcesLifecycleListener" />
  <Listener className="org.apache.catalina.core.ThreadLocalLeakPreventionListener" />

  <GlobalNamingResources>
    <Resource name="UserDatabase" auth="Container" type="org.apache.catalina.UserDatabase"
              factory="org.apache.catalina.users.MemoryUserDatabaseFactory" pathname="conf/tomcat-users.xml" />
  </GlobalNamingResources>
$($servicesXml -join '')
</Server>
"@ | Set-Content "$Home_\conf\server.xml" -Encoding UTF8

# ---------- 5. Desplegar WAR + configuración por servicio ----------
foreach ($s in $Services) {
    $src = Join-Path $Root $s.Dir
    $war = Get-ChildItem "$src\target" -Filter *.war | Select-Object -First 1
    if (-not $war) { throw "No hay WAR en $($s.Dir)\target. Ejecutá con -Build." }

    $appBase = Join-Path $Home_ "webapps-$($s.Name)"
    New-Item -ItemType Directory -Force $appBase | Out-Null
    Remove-Item "$appBase\ROOT" -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item $war.FullName "$appBase\ROOT.war" -Force
    # Maven genera el WAR con fecha fija (1980, builds reproducibles). Sin esto, Tomcat cree que la
    # carpeta ya descomprimida es más nueva y sigue sirviendo el código anterior.
    (Get-Item "$appBase\ROOT.war").LastWriteTime = Get-Date

    # .env del servicio (o el de ms-users, igual que el DotenvEnvironmentPostProcessor)
    $envFile = @("$src\.env", "$Root\ms-users\.env") | ? { Test-Path $_ } | Select-Object -First 1
    $params = @{}
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') {
            $value = $Matches[2].Trim().Trim('"')
            # Un valor vacío pisaría el default de application.properties: se omite
            if ($value -ne '') { $params[$Matches[1]] = $value }
        }
    }
    $params['SERVER_PORT'] = "$($s.Port)"
    $paramXml = ($params.GetEnumerator() | Sort-Object Name | % {
        "  <Parameter name=`"$($_.Name)`" value=`"$(Escape-Xml $_.Value)`" override=`"false`"/>"
    }) -join "`r`n"

    $ctxDir = Join-Path $Home_ "conf\$($s.Name)\localhost"
    New-Item -ItemType Directory -Force $ctxDir | Out-Null
    # Nombre visible en el Manager ("Nombre a Mostrar"). El WAR de Spring Boot no trae web.xml y Tomcat
    # vaciaría el displayName del Context, así que se usa un descriptor alternativo (altDDName) que solo
    # declara <display-name>; metadata-complete="false" mantiene el arranque de Spring Boot.
    @"
<?xml version="1.0" encoding="UTF-8"?>
<web-app xmlns="https://jakarta.ee/xml/ns/jakartaee" version="6.1" metadata-complete="false">
  <display-name>$(Escape-Xml $s.Label)</display-name>
</web-app>
"@ | Set-Content "$ctxDir\web-display.xml" -Encoding UTF8
    $altDD = ("$ctxDir\web-display.xml" -replace '\\', '/')
    "<?xml version=`"1.0`" encoding=`"UTF-8`"?>`r`n<!-- Generado desde $envFile -->`r`n<Context altDDName=`"$altDD`">`r`n$paramXml`r`n</Context>" |
        Set-Content "$ctxDir\ROOT.xml" -Encoding UTF8
    # Manager de Tomcat en cada servicio para poder detenerlo/iniciarlo (alta/baja en Eureka).
    # Cookie de sesión propia: el navegador no separa cookies por puerto, y con el JSESSIONID común
    # los 4 Managers en localhost se pisaban la sesión (y el token CSRF), dando 403 al hacer Stop.
    @"
<?xml version="1.0" encoding="UTF-8"?>
<Context docBase="`${catalina.home}/webapps/manager" privileged="true" sessionCookieName="MANAGER_$($s.Port)" antiResourceLocking="false">
  <Valve className="org.apache.catalina.valves.RemoteAddrValve" allow="127\.\d+\.\d+\.\d+|::1|0:0:0:0:0:0:0:1" />
</Context>
"@ | Set-Content "$ctxDir\manager.xml" -Encoding UTF8
    Write-Host "Desplegado $($s.Name) en el puerto $($s.Port) ($($war.Name))"
}

# ---------- 6. setenv.bat ----------
@"
set "JAVA_HOME=$JavaHome"
set "CATALINA_OPTS=-Xms512m -Xmx3g -Dfile.encoding=UTF-8 -Dstdout.encoding=UTF-8"
"@ | Set-Content "$Home_\bin\setenv.bat" -Encoding ASCII

# ---------- 7. Directorio de trabajo ----------
# Los DotenvEnvironmentPostProcessor buscan .env en el directorio de trabajo y en carpetas vecinas
# (../.env, ../../ms-users/.env). Arrancando desde infra\tomcat-microservicios\run no encuentran
# ninguno y usan los parámetros de ROOT.xml. run\logs apunta a logs\ para que los logs queden juntos.
$run = Join-Path $Home_ 'run'
New-Item -ItemType Directory -Force $run | Out-Null
if (-not (Test-Path "$run\logs")) { New-Item -ItemType Junction -Path "$run\logs" -Target "$Home_\logs" | Out-Null }

Write-Host ''
Write-Host "Listo. Iniciar con: frontend\deploy\distribuido\nodo1-windows\iniciar-nodo1.ps1" -ForegroundColor Green
Write-Host "Credenciales del Manager: $credFile"
