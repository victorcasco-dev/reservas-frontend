# Nodo 2 (Ubuntu en WSL): arranca Redis y Apache, y abre una consola por cada Tomcat de UI.
# Para simular la caída de un nodo de UI: Ctrl+C en su consola. Flecha arriba + Enter lo levanta de nuevo.

$ErrorActionPreference = 'Continue'
$Distro = 'Ubuntu'

wsl -d $Distro -u root -- bash -c "systemctl start redis-server apache2 2>/dev/null || (service redis-server start; service apache2 start)" | Out-Null

foreach ($ui in 'ui1', 'ui2') {
    $cmd = "wsl -d $Distro -u root -- env CATALINA_BASE=/opt/reservas-ui/$ui /opt/tomcat/bin/catalina.sh run"
    $script = "`$host.UI.RawUI.WindowTitle = 'tomcat-$ui (nodo 2)'; Write-Host '== Tomcat UI $ui ==  (Ctrl+C para simular la caida)' -ForegroundColor Cyan; $cmd"
    Start-Process powershell -ArgumentList @('-NoExit', '-NoProfile', '-Command', $script) | Out-Null
    Write-Host "Abierta consola: tomcat-$ui"
}

$ip = (wsl -d $Distro -- hostname -I).Trim().Split(' ')[0]
Write-Host ''
Write-Host "Aplicación (balanceador): http://$ip/" -ForegroundColor Green
Write-Host "mod_status:               http://$ip/server-status" -ForegroundColor Green
Write-Host "Balancer manager:         http://$ip/balancer-manager" -ForegroundColor Green
Write-Host "Redis (para Redis Insight): $ip`:6379" -ForegroundColor Green
