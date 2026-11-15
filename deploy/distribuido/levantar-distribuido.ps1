# Levanta la arquitectura distribuida completa: nodo 1 (Windows) y nodo 2 (Ubuntu en WSL).
# Ver README.md de esta carpeta para la instalación inicial y el guion de la demo.
param([string]$RedisHost)

& "$PSScriptRoot\nodo2-ubuntu\iniciar-nodo2.ps1"
Write-Host ''
& "$PSScriptRoot\nodo1-windows\iniciar-nodo1.ps1" -RedisHost $RedisHost
