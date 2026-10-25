[CmdletBinding()]
param([string]$BaseUrl = 'http://127.0.0.1:8080', [string]$ExpectedVersion)
$ErrorActionPreference = 'Stop'
$BaseUrl = $BaseUrl.TrimEnd('/')
$uri = [Uri]$BaseUrl
if ($uri.Scheme -notin @('http', 'https') -or $uri.UserInfo) { throw 'Use an HTTP URL without credentials.' }
$frontendResponse = Invoke-WebRequest -Uri "$BaseUrl/" -UseBasicParsing -TimeoutSec 15
if ($frontendResponse.StatusCode -ne 200) { throw 'The frontend is unavailable.' }
$ready = Invoke-RestMethod -Uri "$BaseUrl/api/health/ready" -TimeoutSec 15
if ($ready.status -ne 'ok' -or $ready.services.postgres -ne 'ok' -or $ready.services.python -ne 'ok') {
    throw 'Readiness requires both PostgreSQL and FastAPI.'
}
if ($ExpectedVersion -and $ready.version -ne $ExpectedVersion) { throw 'The deployed version differs from the requested commit.' }
$catalogue = Invoke-RestMethod -Uri "$BaseUrl/api/materials?limit=1" -TimeoutSec 15
if ($null -eq $catalogue.total -or $null -eq $catalogue.items) { throw 'Catalogue contract is invalid.' }
$captures = Invoke-RestMethod -Uri "$BaseUrl/api/captures/status" -TimeoutSec 15
Write-Host "Frontend/API/PostgreSQL/FastAPI OK. Version: $($ready.version); publications: $($catalogue.total)."
Write-Host 'This verification reads persisted data; it does not contact retailers or change prices.'
