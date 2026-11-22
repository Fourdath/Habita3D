#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][ValidatePattern('^[a-f0-9]{40}$')][string]$Version,
    [string]$StateDirectory = 'C:\Habita3D-staging',
    [ValidateRange(1024, 65535)][int]$FrontendPort = 18080,
    [ValidateRange(1, 15000)][int]$ReadinessWarningMs = 2000,
    [string]$CiRunUrl,
    [string]$DeploymentRunUrl,
    [switch]$Rehearsal
)
$ErrorActionPreference = 'Stop'

if ($env:TF_VAR_database_password.Length -lt 16) { throw 'Set the target database password in TF_VAR_database_password.' }
if ($env:TF_VAR_materials_api_token.Length -lt 24 -or $env:TF_VAR_materials_api_token.StartsWith('replace-')) {
    throw 'Set the target internal materials token in TF_VAR_materials_api_token.'
}
if ($Rehearsal) {
    if (!$PSBoundParameters.ContainsKey('StateDirectory')) { throw 'Supply a dedicated -StateDirectory for the rehearsal.' }
    if (!$PSBoundParameters.ContainsKey('FrontendPort')) { $FrontendPort = 18083 }
    if ($FrontendPort -eq 18080) { throw 'The rehearsal must use a different port from staging.' }
    if ($CiRunUrl -or $DeploymentRunUrl) { throw 'A local rehearsal cannot record GitHub workflow links as its own.' }
}
if (![IO.Path]::IsPathFullyQualified($StateDirectory) -or !(Test-Path -LiteralPath $StateDirectory -PathType Container)) {
    throw 'Create the protected, absolute state directory before deploying.'
}

$repo = Split-Path -Parent $PSScriptRoot
$repoPath = [IO.Path]::GetFullPath($repo).TrimEnd([char[]]"\/")
$StateDirectory = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $StateDirectory).Path).TrimEnd([char[]]"\/")
if (!$StateDirectory -or $StateDirectory -eq [IO.Path]::GetPathRoot($StateDirectory).TrimEnd([char[]]"\/") -or
    $StateDirectory.Equals($repoPath, [StringComparison]::OrdinalIgnoreCase) -or
    $StateDirectory.StartsWith($repoPath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'The state directory must be a dedicated directory outside the checkout.'
}
for ($dir = Get-Item -LiteralPath $StateDirectory; $dir; $dir = $dir.Parent) {
    if ($dir.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'The state directory cannot traverse a junction or symbolic link.' }
}

$actual = (& git -C $repo rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0 -or $actual -ne $Version) { throw 'Checkout must match the requested commit.' }
$changes = @(& git -C $repo status --porcelain=v1 --untracked-files=normal -- infrastructure frontend backend python-service scripts)
if ($LASTEXITCODE -ne 0 -or $changes.Count) { throw 'Commit deployment-source changes before deploying an identifiable version.' }

$target = 'staging'
$prefix = 'habita3d-staging'
$imageTag = $Version
if ($Rehearsal) {
    $target = 'rehearsal'
    $identifier = [Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($StateDirectory.ToUpperInvariant()))).Substring(0, 12).ToLowerInvariant()
    $prefix = "habita3d-rehearsal-$identifier"
    $imageTag = "rehearsal-$identifier-$Version"
}

function Save-TextAtomically([string]$Path, [string]$Content) {
    $pending = "$Path.pending"
    [IO.File]::WriteAllText($pending, $Content + [Environment]::NewLine)
    Move-Item -LiteralPath $pending -Destination $Path -Force
}

function Invoke-Terraform([string[]]$Arguments) {
    & terraform "-chdir=$terraformDirectory" @Arguments
    if ($LASTEXITCODE -ne 0) { throw "Terraform command failed: $($Arguments[0])" }
}

$terraformDirectory = Join-Path $repo 'infrastructure\terraform\staging'
$statePath = Join-Path $StateDirectory 'terraform.tfstate'
$planPath = Join-Path $StateDirectory 'deployment.tfplan'
$identityPath = Join-Path $StateDirectory 'deployment-target.json'
$marker = Join-Path $StateDirectory 'last-successful-commit.txt'
$contextHost = (& docker context inspect --format '{{.Endpoints.docker.Host}}').Trim()
if ($LASTEXITCODE -ne 0 -or !$contextHost.StartsWith('npipe:')) { throw 'Select the local Docker Desktop context for this Windows host.' }
$dockerOs = (& docker info --format '{{.OSType}}').Trim()
if ($LASTEXITCODE -ne 0 -or $dockerOs -ne 'linux') { throw 'Start Docker Desktop in Linux container mode.' }

$environment = @{
    TF_VAR_name_prefix = $prefix
    TF_VAR_image_tag = $imageTag
    TF_VAR_app_version = $Version
    TF_VAR_frontend_port = "$FrontendPort"
    TF_IN_AUTOMATION = 'true'
    TF_DATA_DIR = (Join-Path $StateDirectory 'terraform-data')
    DOCKER_HOST = $contextHost
    TF_VAR_materials_schedule_enabled = $(if ($Rehearsal -or !$env:TF_VAR_materials_schedule_enabled) { 'false' } else { $env:TF_VAR_materials_schedule_enabled })
}
$originalEnvironment = @{}
$lock = [IO.File]::Open((Join-Path $StateDirectory 'deployment.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
$ownsPlan = $false
try {
    if (Test-Path -LiteralPath $identityPath -PathType Leaf) {
        $identity = Get-Content -LiteralPath $identityPath -Raw | ConvertFrom-Json
        if ($identity.mode -ne $target -or $identity.prefix -ne $prefix) { throw 'The state directory is bound to a different target.' }
    } else {
        if ($Rehearsal -and (Test-Path -LiteralPath $statePath)) { throw 'Rehearsal requires an empty state directory or its existing target marker.' }
        Save-TextAtomically $identityPath ([ordered]@{ mode = $target; prefix = $prefix } | ConvertTo-Json -Compress)
    }

    $listener = [Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners() | Where-Object { $_.Port -eq $FrontendPort }
    if ($listener) {
        $ports = @(& docker port "$prefix-frontend" 80/tcp 2>$null)
        if ($LASTEXITCODE -ne 0 -or "127.0.0.1:$FrontendPort" -notin $ports) { throw "Port $FrontendPort is occupied by a different service." }
    }

    foreach ($entry in $environment.GetEnumerator()) {
        $originalEnvironment[$entry.Key] = [Environment]::GetEnvironmentVariable($entry.Key, 'Process')
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    Invoke-Terraform -Arguments @('init', '-input=false', '-lockfile=readonly')
    Invoke-Terraform -Arguments @('validate', '-no-color')
    # The saved plan contains secrets. Keep it in the local protected directory and remove it after use.
    $ownsPlan = $true
    Invoke-Terraform -Arguments @('plan', '-input=false', '-no-color', "-state=$statePath", '-lock-timeout=60s', "-out=$planPath") | Out-Null

    $backup = $null
    $databaseContainer = "$prefix-postgres"
    $containers = @(& docker container ls --all --filter "name=$databaseContainer" --format '{{.Names}}')
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect existing staging containers.' }
    if ($containers -contains $databaseContainer) {
        $backups = Join-Path $StateDirectory 'backups'
        [void](New-Item -Path $backups -ItemType Directory -Force)
        $stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')
        $backup = "before-$Version-$stamp.dump"
        $dump = Join-Path $backups $backup
        $containerDump = "/tmp/$backup"
        try {
            & docker exec $databaseContainer sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$1"' sh $containerDump
            if ($LASTEXITCODE -ne 0) { throw 'Backup failed; deployment stopped before migrations.' }
            & docker exec $databaseContainer pg_restore --list $containerDump | Out-Null
            if ($LASTEXITCODE -ne 0) { throw 'Backup archive is not readable; deployment stopped.' }
            & docker cp "${databaseContainer}:$containerDump" "$dump.pending"
            if ($LASTEXITCODE -ne 0) { throw 'Cannot save the backup to the protected host directory.' }
            Move-Item -LiteralPath "$dump.pending" -Destination $dump
        } finally {
            & docker exec $databaseContainer rm -f $containerDump | Out-Null
            if (Test-Path -LiteralPath "$dump.pending" -PathType Leaf) { Remove-Item -LiteralPath "$dump.pending" }
        }
    } else {
        $volume = "$prefix-postgres-data"
        $volumes = @(& docker volume ls --filter "name=$volume" --format '{{.Name}}')
        if ($LASTEXITCODE -ne 0) { throw 'Cannot inspect persistent staging volumes.' }
        if ($volumes -contains $volume) { throw 'The database volume exists without its container. Back it up before deploying.' }
    }

    Invoke-Terraform -Arguments @('apply', '-input=false', '-no-color', "-state=$statePath", '-lock-timeout=60s', $planPath)
    $verified = & (Join-Path $PSScriptRoot 'verify-local.ps1') -BaseUrl "http://127.0.0.1:$FrontendPort" -ExpectedVersion $Version -ReadinessWarningMs $ReadinessWarningMs -PassThru
    $report = [ordered]@{
        target = $target
        prefix = $prefix
        commit = $Version
        imageTag = $imageTag
        ciRunUrl = $CiRunUrl
        deploymentRunUrl = $DeploymentRunUrl
        preDeploymentBackup = $backup
        health = $verified
    }
    Save-TextAtomically (Join-Path $StateDirectory 'last-successful-deployment.json') ($report | ConvertTo-Json -Depth 5)
    if (Test-Path -LiteralPath $marker -PathType Leaf) {
        $lastCommit = (Get-Content -LiteralPath $marker -Raw).Trim()
        if ($lastCommit -match '^[a-f0-9]{40}$' -and $lastCommit -ne $Version) {
            Save-TextAtomically (Join-Path $StateDirectory 'previous-successful-commit.txt') $lastCommit
        }
    }
    Save-TextAtomically $marker $Version

    if ($env:GITHUB_STEP_SUMMARY -and !$Rehearsal) {
        @(
            '### Despliegue verificado en Windows'
            ''
            ('- Commit `{0}`' -f $Version)
            ('- Entorno local `{0}`' -f $verified.baseUrl)
            ('- Frontend, NestJS, PostgreSQL y FastAPI operativos. {0} publicaciones guardadas.' -f $verified.publications)
            ('- Readiness {0} ms, umbral de aviso {1} ms, ID de solicitud `{2}`.' -f $verified.readinessMs, $verified.readinessWarningMs, $verified.readinessRequestId)
            "- [CI validada]($CiRunUrl)"
            "- [Ejecución del CD]($DeploymentRunUrl)"
        ) | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8
        if ($verified.latencyWarning) { Write-Host '::warning title=Latencia de staging::La comprobación de readiness superó el umbral.' }
    }
    Write-Host "$target deployed and verified: $Version. Evidence saved in last-successful-deployment.json."
} finally {
    if ($ownsPlan -and (Test-Path -LiteralPath $planPath -PathType Leaf)) { Remove-Item -LiteralPath $planPath }
    foreach ($entry in $originalEnvironment.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable($entry.Key, $entry.Value, 'Process')
    }
    $lock.Dispose()
}
