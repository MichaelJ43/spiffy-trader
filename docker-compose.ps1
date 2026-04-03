# Wrapper for Windows PowerShell: same behavior as docker-compose.sh
# Usage: .\docker-compose.ps1 up --build
# Optional: $env:DOCKER_COMPOSE_FILE = "docker-compose.yml"
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if ($env:DOCKER_COMPOSE_FILE) {
    $file = Join-Path $Root $env:DOCKER_COMPOSE_FILE
}
elseif ([System.Runtime.InteropServices.RuntimeInformation]::IsOSPlatform([System.Runtime.InteropServices.OSPlatform]::OSX)) {
    $file = Join-Path $Root "docker-compose.apple.yml"
}
else {
    $file = Join-Path $Root "docker-compose.yml"
}
& docker compose -f $file --project-directory $Root @args
