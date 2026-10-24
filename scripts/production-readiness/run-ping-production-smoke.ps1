param(
    [string]$ExpectedCommit
)

$ErrorActionPreference = 'Stop'

if ($ExpectedCommit) {
    $env:PING_EXPECTED_COMMIT = $ExpectedCommit.Trim()
} else {
    Remove-Item Env:PING_EXPECTED_COMMIT -ErrorAction SilentlyContinue
}

node (Join-Path $PSScriptRoot 'ping-production-smoke.mjs')
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
