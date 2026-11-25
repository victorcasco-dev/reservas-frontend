# Copia la configuración de sr-microservicios-rodrigo\ms-notificaciones\.env (correo, cron) al
# Tomcat de microservicios y reinicia solo ms-notificaciones, sin tocar los demás servicios.
# Uso: después de completar MAIL_USERNAME / MAIL_PASSWORD / MAIL_FROM y poner MAIL_ENABLED=true.

$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path "$PSScriptRoot\..\..\..\..").Path
$EnvFile = "$Root\sr-microservicios-rodrigo\ms-notificaciones\.env"
$Ctx = "$Root\infra\tomcat-microservicios\conf\ms-notificaciones\localhost\ROOT.xml"

$xml = [IO.File]::ReadAllText($Ctx)
foreach ($line in Get-Content $EnvFile) {
    if ($line -notmatch '^\s*((MAIL|NOTIFICATION)_[A-Z_]+)\s*=\s*(.*)$') { continue }
    $name = $Matches[1]; $value = $Matches[3].Trim().Trim('"')
    if ($value -eq '') { continue }
    $escaped = [System.Security.SecurityElement]::Escape($value)
    $pattern = "<Parameter name=`"$name`" value=`"[^`"]*`""
    if ($xml -match $pattern) {
        $xml = [regex]::Replace($xml, $pattern, "<Parameter name=`"$name`" value=`"$escaped`"")
    } else {
        $xml = $xml -replace '</Context>', "  <Parameter name=`"$name`" value=`"$escaped`" override=`"false`"/>`r`n</Context>"
    }
    Write-Host "  $name actualizado"
}
[IO.File]::WriteAllText($Ctx, $xml, (New-Object Text.UTF8Encoding $false))

# Tomcat solo lee los parámetros de ROOT.xml al arrancar (el reload o redeploy del Manager reutiliza
# el contexto en memoria con los valores viejos), así que se reinicia el Tomcat de microservicios.
$Tomcat = "$Root\infra\tomcat-microservicios"
Get-CimInstance Win32_Process -Filter "Name='java.exe'" | ? { $_.CommandLine -like '*tomcat-microservicios*' } | % { Stop-Process -Id $_.ProcessId -Force }
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | ? { $_.CommandLine -like "*WindowTitle = 'tomcat-microservicios'*" } | % { Stop-Process -Id $_.ProcessId -Force }
Start-Sleep -Seconds 2
$script = "`$host.UI.RawUI.WindowTitle = 'tomcat-microservicios'; Set-Location '$Tomcat\run'; Write-Host '== tomcat-microservicios ==  (Ctrl+C para detener)' -ForegroundColor Cyan; & '$Tomcat\bin\catalina.bat' run 2>&1 | Tee-Object -FilePath '$Tomcat\logs\consola.log'"
Start-Process powershell -WorkingDirectory "$Tomcat\run" -ArgumentList @('-NoExit', '-NoProfile', '-Command', $script) | Out-Null
Write-Host 'Tomcat de microservicios reiniciado: los 4 servicios vuelven en unos 2 minutos.' -ForegroundColor Green
