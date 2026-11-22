[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://127.0.0.1:8080',
    [string]$ExpectedVersion,
    [ValidateRange(1, 15000)][int]$ReadinessWarningMs = 2000,
    [switch]$PassThru
)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$uri = [Uri]$BaseUrl
if ($uri.Scheme -notin @('http', 'https') -or $uri.UserInfo) { throw 'Use an HTTP URL without credentials.' }
$frontendResponse = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 15
if ($frontendResponse.StatusCode -ne 200) { throw 'The frontend is unavailable.' }
$requestId = "deploy-$([Guid]::NewGuid().ToString('N'))"
$timer = [Diagnostics.Stopwatch]::StartNew()
$readinessResponse = Invoke-WebRequest -Uri "$BaseUrl/api/health/ready" -UseBasicParsing -TimeoutSec 15 -Headers @{ 'X-Request-ID' = $requestId }
$timer.Stop()
$ready = $readinessResponse.Content | ConvertFrom-Json
if ($ready.status -ne 'ok' -or $ready.services.postgres -ne 'ok' -or $ready.services.python -ne 'ok') {
    throw 'Readiness requires both PostgreSQL and FastAPI.'
}
if ($ExpectedVersion -and $ready.version -ne $ExpectedVersion) { throw 'The deployed version differs from the requested commit.' }
if (@($readinessResponse.Headers['X-Request-ID'])[0] -ne $requestId) { throw 'Readiness did not echo the operation request ID.' }
$catalogue = Invoke-RestMethod -Uri "$BaseUrl/api/materials?limit=1" -TimeoutSec 15
if ($null -eq $catalogue.total -or $null -eq $catalogue.items) { throw 'Catalogue contract is invalid.' }
$captures = Invoke-RestMethod -Uri "$BaseUrl/api/captures/status" -TimeoutSec 15
if ($null -eq $captures -or 'timezone' -notin $captures.PSObject.Properties.Name) { throw 'Capture status contract is invalid.' }
$latencyWarning = $timer.ElapsedMilliseconds -gt $ReadinessWarningMs
if ($latencyWarning) { Write-Warning "Readiness took $($timer.ElapsedMilliseconds) ms (threshold $ReadinessWarningMs ms; request $requestId)." }
Write-Host "Frontend/API/PostgreSQL/FastAPI OK. Version: $($ready.version); publications: $($catalogue.total); readiness: $($timer.ElapsedMilliseconds) ms; request: $requestId."
Write-Host 'This verification reads persisted data; it does not contact retailers or change prices.'

if ($PassThru) {
    [pscustomobject]@{
        checkedAtUtc = [DateTime]::UtcNow.ToString('o')
        baseUrl = $BaseUrl
        version = $ready.version
        frontendStatus = [int]$frontendResponse.StatusCode
        readiness = $ready.status
        services = $ready.services
        readinessRequestId = $requestId
        readinessMs = $timer.ElapsedMilliseconds
        readinessWarningMs = $ReadinessWarningMs
        latencyWarning = $latencyWarning
        publications = [int]$catalogue.total
        latestCaptureStatus = $captures.latestJob.status
    }
}
