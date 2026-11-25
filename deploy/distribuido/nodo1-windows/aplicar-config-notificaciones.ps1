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

# Reinicio de ms-notificaciones con el Manager de Tomcat
$pwd_ = ((Get-Content "$Root\infra\credenciales-tomcat.txt" | ? { $_ -like 'contrase*' }) -replace '^[^:]+:\s*', '').Trim()
$cred = New-Object PSCredential('admin', (ConvertTo-SecureString $pwd_ -AsPlainText -Force))
(Invoke-WebRequest 'http://localhost:8083/manager/text/reload?path=/' -Credential $cred -UseBasicParsing -TimeoutSec 180).Content
Write-Host 'ms-notificaciones reiniciado con la nueva configuración.' -ForegroundColor Green
