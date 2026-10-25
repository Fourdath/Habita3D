#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Version,
    [string]$StateDirectory = 'C:\Habita3D-staging',
    [int]$FrontendPort = 18080
)
$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^[a-f0-9]{40}$') { throw 'Version must be a full Git commit SHA.' }
if ($env:TF_VAR_database_password.Length -lt 16) { throw 'Configure STAGING_DATABASE_PASSWORD in the protected environment.' }
if ($env:TF_VAR_materials_api_token.Length -lt 24 -or $env:TF_VAR_materials_api_token.StartsWith('replace-')) {
    throw 'Configure STAGING_MATERIALS_API_TOKEN in the protected environment.'
}
if (-not [IO.Path]::IsPathFullyQualified($StateDirectory)) {
    throw 'StateDirectory must be an absolute path outside the checkout.'
}
if (-not (Test-Path -LiteralPath $StateDirectory -PathType Container)) {
    throw 'An operator must first create the protected staging state directory; see the staging manual.'
}
$repo = Split-Path -Parent $PSScriptRoot
$repoPath = [IO.Path]::GetFullPath($repo).TrimEnd([char[]]"\/")
$StateDirectory = [IO.Path]::GetFullPath((Get-Item -LiteralPath $StateDirectory).FullName).TrimEnd([char[]]"\/")
if ($StateDirectory.Equals($repoPath, [StringComparison]::OrdinalIgnoreCase) -or
    $StateDirectory.StartsWith($repoPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'StateDirectory must remain outside the checkout so checkout cleanup cannot erase state and backups.'
}
$actual = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actual -ne $Version) { throw 'Checkout must match the previously verified CI commit.' }
$terraformDirectory = Join-Path $repo 'infrastructure\terraform\staging'
$statePath = Join-Path $StateDirectory 'terraform.tfstate'
$previous = Join-Path $StateDirectory 'last-successful-commit.txt'
$env:TF_VAR_name_prefix = 'habita3d-staging'
$env:TF_VAR_image_tag = $Version
$env:TF_VAR_frontend_port = "$FrontendPort"
$env:TF_IN_AUTOMATION = 'true'
if (-not $env:TF_VAR_materials_schedule_enabled) { $env:TF_VAR_materials_schedule_enabled = 'false' }
$contextHost = (& docker context inspect --format '{{.Endpoints.docker.Host}}').Trim()
if ($LASTEXITCODE -ne 0 -or -not $contextHost) { throw 'Docker Desktop must be running for the runner user.' }
$env:DOCKER_HOST = $contextHost

function Invoke-Terraform([string[]]$Arguments) {
    & terraform "-chdir=$terraformDirectory" @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Terraform command failed: $($Arguments[0])" }
}

Invoke-Terraform -Arguments @('init', '-input=false', '-lockfile=readonly')
Invoke-Terraform -Arguments @('validate', '-no-color')
# Legacy -state is intentional: this dedicated local backend must survive runner checkout cleanup.
# State, backup and lock files remain in the operator-restricted directory, never GitHub artifacts.
Invoke-Terraform -Arguments @('plan', '-input=false', '-no-color', "-state=$statePath", '-lock-timeout=60s')
# Save a PostgreSQL dump before an existing installation applies schema migrations.
# Use a container file plus docker cp: PowerShell 5 native stdout redirection can corrupt binary dumps.
$databaseContainer = 'habita3d-staging-postgres'
$containers = @(& docker container ls --all --filter "name=$databaseContainer" --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing staging containers.' }
if ($containers -contains $databaseContainer) {
    $backups = Join-Path $StateDirectory 'backups'
    if (-not (Test-Path $backups)) { [void](New-Item -ItemType Directory -Path $backups) }
    $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    $dump = Join-Path $backups "before-$Version-$stamp.dump"
    & docker exec $databaseContainer sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f /tmp/habita3d-predeploy.dump'
    if ($LASTEXITCODE -ne 0) { throw 'Backup failed; deployment stopped before migrations.' }
    & docker exec $databaseContainer pg_restore --list /tmp/habita3d-predeploy.dump | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Backup archive is not readable; deployment stopped.' }
    & docker cp "${databaseContainer}:/tmp/habita3d-predeploy.dump" $dump
    if ($LASTEXITCODE -ne 0) { throw 'Cannot save the backup to the protected host directory.' }
} else {
    $volumes = @(& docker volume ls --filter 'name=habita3d-staging-postgres-data' --format '{{.Name}}')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect persistent staging volumes.' }
    if ($volumes -contains 'habita3d-staging-postgres-data') {
        throw 'Database volume exists without its container. Have the operator back it up before deploying.'
    }
}
Invoke-Terraform -Arguments @('apply', '-input=false', '-auto-approve', "-state=$statePath", '-lock-timeout=60s')
& (Join-Path $PSScriptRoot 'verify-local.ps1') -BaseUrl "http://127.0.0.1:$FrontendPort" -ExpectedVersion $Version
if (Test-Path $previous) { Copy-Item $previous (Join-Path $StateDirectory 'previous-successful-commit.txt') -Force }
[IO.File]::WriteAllText($previous, $Version + [Environment]::NewLine)
Write-Host "Staging deployed and verified: $Version. Persistent database/evidence volumes remain intact."
