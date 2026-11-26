# Nodo 1 (Windows): Eureka, Tomcat de microservicios y API Gateway, cada uno en su consola.
# Para detener uno: Ctrl+C en su ventana. Para volver a iniciarlo: flecha arriba + Enter.

param([string]$RedisHost)

$ErrorActionPreference = 'Continue'
$Root = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path
$Tomcat = Join-Path $Root 'infra\tomcat-microservicios'
$Java = 'C:\Program Files\Java\jdk-25\bin\java.exe'

function Open-Console([string]$Title, [string]$Dir, [string]$Command) {
    $script = "`$host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$Dir'; Write-Host '== $Title ==  (Ctrl+C para detener)' -ForegroundColor Cyan; $Command"
    Start-Process powershell -WorkingDirectory $Dir -ArgumentList @('-NoExit', '-NoProfile', '-Command', $script) | Out-Null
    Write-Host "Abierta consola: $Title"
}

function Wait-Port([int]$Port, [int]$Seconds = 120) {
    $limit = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $limit) {
        try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1', $Port); $c.Close(); return } catch { Start-Sleep 2 }
    }
    Write-Warning "El puerto $Port no respondió en $Seconds s"
}

$eurekaJar = (Get-ChildItem "$Root\eureka-server\target" -Filter *.jar | ? { $_.Name -notlike '*original*' } | Select -First 1).FullName
$gatewayJar = (Get-ChildItem "$Root\api-gateway\target" -Filter *.jar | ? { $_.Name -notlike '*original*' } | Select -First 1).FullName

Open-Console 'eureka-server' "$Root\eureka-server" "& '$Java' -jar '$eurekaJar'"
Wait-Port 8761

# Redis corre en el nodo 2 (WSL). Su IP cambia al reiniciar WSL: se actualiza REDIS_HOST en la
# configuración de cada microservicio antes de arrancar Tomcat. Con otra PC: -RedisHost <ip>.
if (-not $RedisHost) { $RedisHost = (wsl -d Ubuntu -- hostname -I).Trim().Split(' ')[0] }
Get-ChildItem "$Tomcat\conf\*\localhost\ROOT.xml" | % {
    $xml = Get-Content $_.FullName -Raw -Encoding UTF8
    if ($xml -match 'name="REDIS_HOST"') {
        $xml = $xml -replace '(name="REDIS_HOST" value=")[^"]*', "`${1}$RedisHost"
    } else {
        $xml = $xml -replace '</Context>', "  <Parameter name=`"REDIS_HOST`" value=`"$RedisHost`" override=`"false`"/>`r`n</Context>"
    }
    [IO.File]::WriteAllText($_.FullName, $xml, (New-Object Text.UTF8Encoding $false))
}
Write-Host "Redis (nodo 2): $RedisHost`:6379"

# Se arranca desde run\ (sin .env cerca): cada servicio usa los parámetros de
# conf\<servicio>\localhost\ROOT.xml. Los logs quedan en infra\tomcat-microservicios\logs.
Open-Console 'tomcat-microservicios' "$Tomcat\run" "& '$Tomcat\bin\catalina.bat' run 2>&1 | Tee-Object -FilePath '$Tomcat\logs\consola.log'"

# El gateway escucha en todas las interfaces: el balanceador del nodo 2 le reenvía /api.
# La consola también queda en api-gateway\gateway-consola.log: ahí se ve la traza [GW] de cada
# petición enrutada (ruta, instancia del Tomcat de microservicios, estado y tiempo).
Open-Console 'api-gateway' "$Root\api-gateway" "& '$Java' -jar '$gatewayJar' 2>&1 | Tee-Object -FilePath '$Root\api-gateway\gateway-consola.log'"

Write-Host ''
Write-Host 'Eureka:  http://localhost:8761' -ForegroundColor Green
Write-Host 'Gateway: http://localhost:8080' -ForegroundColor Green
Write-Host 'Manager de cada microservicio: http://localhost:8081/manager/html ... 8084' -ForegroundColor Green
