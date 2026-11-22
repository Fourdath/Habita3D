#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$BackupPath,
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^habita3d/postgres:[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$')]
    [string]$Image
)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $BackupPath
if ($file -isnot [IO.FileInfo] -or $file.Length -eq 0) { throw 'Indique un respaldo local no vacío.' }
$container = 'habita3d-restore-check-' + [Guid]::NewGuid().ToString('N')
$database = 'habita_restore_check'

function Invoke-CheckedDocker([string[]]$DockerArgs) {
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "Falló Docker en el ensayo aislado ($($DockerArgs[0]))." }
}

# Docker assigns a temporary data volume. No networks, published ports, mounts
# from staging or staging credentials are used for this short-lived rehearsal.
$null = Invoke-CheckedDocker -DockerArgs @(
    'run', '--detach', '--rm', '--pull', 'never', '--network', 'none', '--name', $container,
    '--env', 'POSTGRES_HOST_AUTH_METHOD=trust', '--env', "POSTGRES_DB=$database", $Image
)
try {
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        # The initial bootstrap server only listens on Unix sockets. Wait for TCP.
        & docker exec $container pg_isready -h 127.0.0.1 -U postgres -d $database --quiet
        if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        Start-Sleep -Seconds 2
    }
    if (-not $ready) { throw 'La base aislada no inició dentro de 60 segundos.' }
    Invoke-CheckedDocker -DockerArgs @('cp', $file.FullName, "${container}:/tmp/restore-check.dump")
    Invoke-CheckedDocker -DockerArgs @(
        'exec', $container, 'pg_restore', '--exit-on-error', '--no-owner', '--no-privileges',
        '--username', 'postgres', '--dbname', $database, '/tmp/restore-check.dump'
    )
    $counts = Invoke-CheckedDocker -DockerArgs @(
        'exec', $container, 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-qAt',
        '-U', 'postgres', '-d', $database, '-c',
        'SELECT count(*) FROM "Publication"; SELECT count(*) FROM "Project"; SELECT count(*) FROM "Room";'
    )
    if (@($counts).Count -ne 3) { throw 'No se pudieron comprobar los conteos restaurados.' }
    [ordered]@{
        status = 'ok'
        checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
        image = $Image
        publications = [int]$counts[0]
        projects = [int]$counts[1]
        rooms = [int]$counts[2]
    } | ConvertTo-Json -Compress
} finally {
    & docker rm --force $container | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Revisar limpieza del contenedor aislado $container." }
}
