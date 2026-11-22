[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$ExpectedVersion,
    [ValidateRange(0, 60000)][int]$AlertAfterMs = 0,
    [switch]$ReportJson
)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$uri = [Uri]$BaseUrl
if (-not $uri.IsAbsoluteUri -or $uri.Scheme -notin @('http', 'https') -or $uri.UserInfo -or
    $uri.AbsolutePath -ne '/' -or $uri.Query -or $uri.Fragment) {
    throw 'Use the application origin as an HTTP URL without credentials.'
}

$measurements = [ordered]@{}
function Invoke-Check([string]$Name, [string]$Path, [switch]$Frontend) {
    $requestId = 'staging-' + [Guid]::NewGuid().ToString('N')
    $headers = @{ 'X-Request-ID' = $requestId }
    $timer = [Diagnostics.Stopwatch]::StartNew()
    try {
        if ($Frontend) {
            $result = Invoke-WebRequest -Uri "$BaseUrl$Path" -Headers $headers -UseBasicParsing -TimeoutSec 15 -MaximumRedirection 0
            if ($result.StatusCode -ne 200) { throw 'Unexpected HTTP status.' }
        } else {
            $result = Invoke-RestMethod -Uri "$BaseUrl$Path" -Headers $headers -TimeoutSec 15 -MaximumRedirection 0
        }
    } catch {
        throw "ALERT Habita3D check=$Name request_id=$requestId unavailable."
    } finally {
        $timer.Stop()
    }
    $durationMs = [Math]::Round($timer.Elapsed.TotalMilliseconds, 1)
    $measurements[$Name] = [ordered]@{ durationMs = $durationMs; requestId = $requestId }
    if ($AlertAfterMs -gt 0 -and $durationMs -gt $AlertAfterMs) {
        throw "ALERT Habita3D check=$Name request_id=$requestId latency_ms=$durationMs limit_ms=$AlertAfterMs."
    }
    return $result
}

$null = Invoke-Check 'frontend' '/' -Frontend
$ready = Invoke-Check 'readiness' '/api/health/ready'
if ($ready.status -ne 'ok' -or $ready.services.postgres -ne 'ok' -or $ready.services.python -ne 'ok') {
    throw 'ALERT Habita3D readiness requires both PostgreSQL and FastAPI.'
}
if ($ExpectedVersion -and $ready.version -ne $ExpectedVersion) {
    throw 'ALERT Habita3D deployed version differs from the requested commit.'
}
$catalogue = Invoke-Check 'catalogue' '/api/materials?limit=1'
if ($null -eq $catalogue.total -or $null -eq $catalogue.items) { throw 'ALERT Habita3D invalid catalogue contract.' }
$captures = Invoke-Check 'captures' '/api/captures/status'
if ($null -eq $captures -or $null -eq $captures.scheduleEnabled) { throw 'ALERT Habita3D invalid capture-status contract.' }
$recommendations = Invoke-Check 'recommendations' '/api/health/recommendations'
if ($recommendations.status -ne 'ok' -or -not $recommendations.ruleVersion) {
    throw 'ALERT Habita3D recommendation engine check failed.'
}

$report = [ordered]@{
    status = 'ok'
    checkedAt = [DateTimeOffset]::UtcNow.ToString('o')
    version = $ready.version
    services = $ready.services
    publications = $catalogue.total
    recommendationRule = $recommendations.ruleVersion
    captures = @{
        scheduleEnabled = $captures.scheduleEnabled
        latestStatus = $captures.latestJob.status
    }
    checks = $measurements
}
if ($ReportJson) {
    $report | ConvertTo-Json -Depth 5 -Compress
} else {
    Write-Host "Frontend/API/PostgreSQL/FastAPI OK. Version: $($ready.version); publications: $($catalogue.total)."
    Write-Host "Recommendation engine OK: $($recommendations.ruleVersion)."
    foreach ($entry in $measurements.GetEnumerator()) {
        Write-Host "$($entry.Key): $($entry.Value.durationMs) ms; request_id=$($entry.Value.requestId)"
    }
}
