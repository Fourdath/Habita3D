#requires -Version 7.2
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$StateDirectory,
    [ValidatePattern('^before-[a-f0-9]{40}-[0-9]{8}T[0-9]{6,9}Z\.dump$')][string]$BackupFile,
    [switch]$PassThru
)
$ErrorActionPreference = 'Stop'

if (![IO.Path]::IsPathFullyQualified($StateDirectory) -or !(Test-Path -LiteralPath $StateDirectory -PathType Container)) {
    throw 'Use the absolute state directory of a verified deployment.'
}
$state = (Resolve-Path -LiteralPath $StateDirectory).Path
$identity = Get-Content -LiteralPath (Join-Path $state 'deployment-target.json') -Raw | ConvertFrom-Json
if ($identity.prefix -notmatch '^habita3d-(staging|rehearsal-[a-f0-9]{12})$') { throw 'The deployment target is not recognized.' }
$deployed = Get-Content -LiteralPath (Join-Path $state 'last-successful-deployment.json') -Raw | ConvertFrom-Json
if ($deployed.prefix -ne $identity.prefix -or $deployed.commit -notmatch '^[a-f0-9]{40}$') { throw 'Run a verified deployment first.' }
if (!$BackupFile) { $BackupFile = $deployed.preDeploymentBackup }
if ($BackupFile -notmatch '^before-[a-f0-9]{40}-[0-9]{8}T[0-9]{6,9}Z\.dump$') { throw 'Choose a backup created by the deployment script.' }
$archive = Join-Path $state (Join-Path 'backups' $BackupFile)
if (!(Test-Path -LiteralPath $archive -PathType Leaf) -or (Get-Item -LiteralPath $archive).Attributes -band [IO.FileAttributes]::ReparsePoint) {
    throw 'The selected deployment backup does not exist as a regular file.'
}

$source = "$($identity.prefix)-postgres"
$target = "$($identity.prefix)-restore-$([Guid]::NewGuid().ToString('N').Substring(0, 8))"
$image = (& docker container inspect --format '{{.Image}}' $source).Trim()
if ($LASTEXITCODE -ne 0 -or $image -notmatch '^sha256:[a-f0-9]{64}$') { throw 'The deployment PostgreSQL image is unavailable.' }

# Trust is confined to this disposable container with no Docker network and no exposed ports.
$started = & docker run --detach --rm --pull never --network none --name $target `
    -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_USER=habita3d_restore -e POSTGRES_DB=habita3d_restore $image
if ($LASTEXITCODE -ne 0 -or !$started) { throw 'Cannot start the isolated restore container.' }
try {
    for ($attempt = 1; $attempt -le 45; $attempt++) {
        & docker exec $target pg_isready -h 127.0.0.1 -U habita3d_restore -d habita3d_restore | Out-Null
        if ($LASTEXITCODE -eq 0) { break }
        if ($attempt -eq 45) { throw 'The restore container did not become ready.' }
        Start-Sleep -Seconds 1
    }
    & docker cp $archive "${target}:/tmp/habita3d.dump"
    if ($LASTEXITCODE -ne 0) { throw 'Cannot copy the deployment backup to the isolated container.' }
    & docker exec $target pg_restore --list /tmp/habita3d.dump | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'The PostgreSQL archive is invalid.' }
    & docker exec $target pg_restore -U habita3d_restore -d habita3d_restore --no-owner --no-privileges --single-transaction --exit-on-error /tmp/habita3d.dump
    if ($LASTEXITCODE -ne 0) { throw 'Restoring the deployment backup failed.' }

    $sql = @'
SELECT json_build_object(
    'projects', (SELECT count(*) FROM "Project"),
    'rooms', (SELECT count(*) FROM "Room"),
    'floorSelections', (SELECT count(*) FROM "Room" WHERE "publicationKey" IS NOT NULL),
    'publications', (SELECT count(*) FROM "Publication")
);
'@
    $counts = $sql | & docker exec -i $target psql -X -v ON_ERROR_STOP=1 -qAt -U habita3d_restore -d habita3d_restore
    if ($LASTEXITCODE -ne 0 -or !$counts) { throw 'The restored application tables could not be read.' }
    $result = [pscustomobject]@{
        verifiedAtUtc = [DateTime]::UtcNow.ToString('o')
        prefix = $identity.prefix
        deployedCommit = $deployed.commit
        backupFile = $BackupFile
        backupSha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        restoreTarget = 'isolated PostgreSQL container, no network or published ports'
        counts = $counts | ConvertFrom-Json
    }
    $report = Join-Path $state 'last-verified-restore.json'
    [IO.File]::WriteAllText($report, ($result | ConvertTo-Json -Depth 4) + [Environment]::NewLine)
    Write-Host "Backup restored and verified in isolation. Evidence saved in $report."
    if ($PassThru) { $result }
} finally {
    & docker stop $target | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Warning "Could not stop restore container $target." }
}
