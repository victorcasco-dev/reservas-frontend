<#
.SYNOPSIS
  Levanta todo el sistema de Reservas con un solo comando (Docker Compose).

.DESCRIPTION
  Eureka, Redis + Redis Insight, ms-users, ms-availability, ms-reservas, ms-notificaciones,
  API Gateway y el frontend. Los repos tienen que estar clonados como carpetas hermanas
  (api-gateway, eureka-server, commons/commons, ms-users, ms-availability,
  sr-microservicios-rodrigo, frontend).

.PARAMETER Pull       Hace git pull de cada repo antes de construir.
.PARAMETER Rebuild    Reconstruye las imágenes sin caché.
.PARAMETER Test       Corre la prueba de humo (deploy/smoke_test.py) al terminar.
.PARAMETER Down       Detiene y elimina los contenedores.

.EXAMPLE
  .\deploy\up.ps1
  .\deploy\up.ps1 -Pull -Test
  .\deploy\up.ps1 -Down
#>
param(
    [switch]$Pull,
    [switch]$Rebuild,
    [switch]$Test,
    [switch]$Down
)

# 'Continue': docker escribe progreso/avisos en stderr; los errores se detectan por $LASTEXITCODE.
$ErrorActionPreference = 'Continue'
$deployDir = $PSScriptRoot
$frontendDir = Split-Path $deployDir -Parent
$workspace = Split-Path $frontendDir -Parent
$compose = Join-Path $deployDir 'docker-compose.yml'
$envFile = Join-Path $deployDir '.env'

function Invoke-Compose([string[]]$composeArgs) {
    & docker compose -f $compose --env-file $envFile @composeArgs 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "docker compose $($composeArgs -join ' ') falló" }
}

docker info 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Docker no está corriendo. Abrí Docker Desktop y volvé a intentar.' }

if ($Down) {
    Invoke-Compose @('down')
    Write-Host 'Stack detenido.' -ForegroundColor Green
    return
}

$repos = @('eureka-server', 'api-gateway', 'commons/commons', 'ms-users', 'ms-availability',
           'sr-microservicios-rodrigo', 'frontend')
foreach ($repo in $repos) {
    $path = Join-Path $workspace $repo
    if (-not (Test-Path $path)) { throw "Falta el repo '$repo' en $workspace" }
    if ($Pull) {
        Write-Host "git pull $repo" -ForegroundColor Cyan
        git -C $path pull --ff-only
    }
}

if (-not (Test-Path $envFile)) {
    Copy-Item (Join-Path $deployDir '.env.example') $envFile
    # Reutiliza credenciales de ms-users/.env si existe.
    $usersEnv = Join-Path $workspace 'ms-users/.env'
    if (Test-Path $usersEnv) {
        $values = @{}
        Get-Content $usersEnv | Where-Object { $_ -match '^(DB_URL|DB_USERNAME|DB_PASSWORD|JWT_SECRET)=' } |
            ForEach-Object { $k, $v = $_ -split '=', 2; $values[$k] = $v }
        $content = Get-Content $envFile | ForEach-Object {
            $k = ($_ -split '=', 2)[0]
            if ($values.ContainsKey($k)) { "$k=$($values[$k])" } else { $_ }
        }
        Set-Content -Path $envFile -Value $content -Encoding utf8
        Write-Host 'deploy/.env creado con las credenciales de ms-users/.env' -ForegroundColor Yellow
    } else {
        throw "Se creó $envFile desde el ejemplo. Completá DB_URL, DB_USERNAME, DB_PASSWORD y JWT_SECRET y volvé a ejecutar."
    }
}

if ($Rebuild) { Invoke-Compose @('build', '--no-cache') }
Invoke-Compose @('up', '-d', '--build')

$ports = @{ FRONTEND_PORT = 5173; GATEWAY_PORT = 8080; EUREKA_PORT = 8761; REDIS_INSIGHT_PORT = 5540 }
Get-Content $envFile | Where-Object { $_ -match '^(FRONTEND|GATEWAY|EUREKA|REDIS_INSIGHT)_PORT=' } |
    ForEach-Object { $k, $v = $_ -split '=', 2; $ports[$k] = [int]$v }
$gateway = "http://localhost:$($ports.GATEWAY_PORT)"

Write-Host 'Esperando a que el gateway encuentre los 4 microservicios...' -ForegroundColor Cyan
$deadline = (Get-Date).AddMinutes(5)
$ready = $false
while ((Get-Date) -lt $deadline) {
    try {
        $apps = Invoke-RestMethod -Uri "http://localhost:$($ports.EUREKA_PORT)/eureka/apps" -Headers @{ Accept = 'application/json' } -TimeoutSec 5
        $names = @($apps.applications.application | ForEach-Object { $_.name })
        $allUp = @('MS-USERS', 'MS-AVAILABILITY', 'MS-RESERVAS', 'MS-NOTIFICACIONES', 'API-GATEWAY' |
            Where-Object { $names -notcontains $_ }).Count -eq 0
        if ($allUp) {
            # El login con datos inválidos debe responder 401 (no 5xx): ms-users es alcanzable vía gateway.
            try {
                Invoke-WebRequest -Uri "$gateway/auth/login" -Method Post -ContentType 'application/json' `
                    -Body '{"email":"ping@example.com","password":"x"}' -TimeoutSec 10 -UseBasicParsing | Out-Null
            } catch {
                $code = [int]$_.Exception.Response.StatusCode
                if ($code -eq 401 -or $code -eq 400) { $ready = $true; break }
            }
        }
    } catch { }
    Start-Sleep -Seconds 3
}
if (-not $ready) { Write-Warning 'El gateway todavía no responde; revisá: docker compose -f deploy/docker-compose.yml logs -f' }

# Espera unos segundos extra a que el gateway refresque el registro de todos los servicios.
Start-Sleep -Seconds 8

Write-Host ''
Write-Host 'Stack listo:' -ForegroundColor Green
Write-Host "  Frontend       http://localhost:$($ports.FRONTEND_PORT)"
Write-Host "  API Gateway    $gateway   (Swagger: $gateway/swagger-ui.html)"
Write-Host "  Eureka         http://localhost:$($ports.EUREKA_PORT)"
Write-Host "  Redis Insight  http://localhost:$($ports.REDIS_INSIGHT_PORT)   (base: redis:6379)"
Write-Host "  Logs           docker compose -f deploy/docker-compose.yml logs -f ms-reservas"

if ($Test) {
    python (Join-Path $deployDir 'smoke_test.py') --gateway $gateway --frontend "http://localhost:$($ports.FRONTEND_PORT)"
}
