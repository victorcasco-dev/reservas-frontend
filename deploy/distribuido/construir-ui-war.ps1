# Compila el frontend y lo empaqueta como reservas-ui.war para los Tomcat de UI (nodo 2).
# El WAR usa rutas relativas /api, que el balanceador Apache reenvía al API Gateway.

$ErrorActionPreference = 'Stop'
$Frontend = (Resolve-Path "$PSScriptRoot\..\..").Path
$Out = Join-Path $PSScriptRoot 'build'
$Stage = Join-Path $Out 'stage'
$Jar = 'C:\Program Files\Java\jdk-25\bin\jar.exe'

Push-Location $Frontend
try {
    $env:VITE_API_BASE_URL = '/api'
    npm run build
    if ($LASTEXITCODE) { throw 'Falló npm run build' }
} finally { Pop-Location }

if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
New-Item -ItemType Directory -Force $Stage | Out-Null
Copy-Item "$Frontend\dist\*" $Stage -Recurse
Copy-Item "$PSScriptRoot\ui-war\*" $Stage -Recurse -Force

$war = Join-Path $Out 'reservas-ui.war'
if (Test-Path $war) { Remove-Item $war -Force }
& $Jar -cf $war -C $Stage .
Write-Host "WAR generado: $war ($([math]::Round((Get-Item $war).Length / 1KB)) KB)" -ForegroundColor Green
