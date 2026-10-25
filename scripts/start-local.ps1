[CmdletBinding()]
param([switch]$EnableSchedule)
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo

function New-LocalSecret {
    $bytes = New-Object byte[] 32
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($bytes) } finally { $generator.Dispose() }
    return ([BitConverter]::ToString($bytes)).Replace('-', '').ToLowerInvariant()
}

if (-not (Test-Path '.env')) {
    $text = [IO.File]::ReadAllText((Join-Path $repo '.env.example'))
    $text = $text.Replace('replace-with-a-unique-local-password', (New-LocalSecret))
    $text = $text.Replace('replace-with-a-random-token-of-at-least-24-characters', (New-LocalSecret))
    [IO.File]::WriteAllText((Join-Path $repo '.env'), $text, (New-Object Text.UTF8Encoding($false)))
    Write-Host 'Created local .env with generated credentials. Never commit or share that file.'
}

& docker info --format '{{.ServerVersion}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop with Linux containers before continuing.' }
$commit = (& git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Cannot identify the repository commit.' }
$env:APP_VERSION = $commit
$env:IMAGE_TAG = $commit
$previousSchedule = [Environment]::GetEnvironmentVariable('MATERIALS_SCHEDULE_ENABLED', 'Process')
try {
    if ($EnableSchedule) { $env:MATERIALS_SCHEDULE_ENABLED = 'true' }
    & docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Invalid local Compose settings; review .env.' }
    & docker compose up --build --detach --wait --wait-timeout 240
    if ($LASTEXITCODE -ne 0) { throw 'Startup failed. Inspect docker compose logs; keep the data volumes.' }
    $port = if ($env:FRONTEND_PORT) { $env:FRONTEND_PORT } else {
        $line = Get-Content '.env' | Where-Object { $_ -match '^FRONTEND_PORT=' } | Select-Object -Last 1
        if ($line) { ($line -split '=', 2)[1] } else { '8080' }
    }
    & (Join-Path $PSScriptRoot 'verify-local.ps1') -BaseUrl "http://127.0.0.1:$port" -ExpectedVersion $commit
    Write-Host 'Local startup finished. Captures run only when enabled and the computer is awake.'
} finally {
    # Do not accidentally enable acquisition for later commands in this PowerShell session.
    [Environment]::SetEnvironmentVariable('MATERIALS_SCHEDULE_ENABLED', $previousSchedule, 'Process')
}
