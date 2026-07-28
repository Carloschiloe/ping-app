param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [string]$ExpectedProjectRef = 'oonijgmddgyymhrlnvuu',

    [switch]$ConfirmEncryptedDestination,

    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($DatabaseUrl -notmatch [regex]::Escape($ExpectedProjectRef)) {
    throw "DatabaseUrl does not belong to the expected staging project."
}

foreach ($tool in @('pg_dump', 'pg_restore', 'psql')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
        throw "Required tool not found: $tool"
    }
}

$repositoryRoot = [IO.Path]::GetFullPath(
    (git rev-parse --show-toplevel).Trim()
).TrimEnd('\', '/')
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\', '/')

$isRepositoryRoot = $resolvedOutput.Equals(
    $repositoryRoot,
    [StringComparison]::OrdinalIgnoreCase
)
$isInsideRepository = $resolvedOutput.StartsWith(
    "$repositoryRoot$([IO.Path]::DirectorySeparatorChar)",
    [StringComparison]::OrdinalIgnoreCase
)

if ($isRepositoryRoot -or $isInsideRepository) {
    throw "Backups must be written outside the repository."
}

if (-not $ConfirmEncryptedDestination) {
    throw "Use -ConfirmEncryptedDestination only after selecting encrypted storage."
}

if ($ValidateOnly) {
    [pscustomobject]@{
        Valid = $true
        ProjectRef = $ExpectedProjectRef
        OutputDirectory = $resolvedOutput
        WritesRemoteData = $false
    } | ConvertTo-Json
    return
}

if (-not $env:PING_STAGING_DB_PASSWORD) {
    throw "PING_STAGING_DB_PASSWORD is required and must not be passed on the command line."
}

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$dumpPath = Join-Path $resolvedOutput "ping-staging-pre-private-files-$timestamp.dump"
$restoreListPath = Join-Path $resolvedOutput "ping-staging-pre-private-files-$timestamp.restore-list.txt"
$manifestPath = Join-Path $resolvedOutput "ping-staging-pre-private-files-$timestamp.manifest.json"

$previousPgPassword = $env:PGPASSWORD
$previousPgOptions = $env:PGOPTIONS

try {
    $env:PGPASSWORD = $env:PING_STAGING_DB_PASSWORD
    $env:PGOPTIONS = '-c default_transaction_read_only=on'

    $objectCount = (& psql $DatabaseUrl --tuples-only --no-align --command `
        "select count(*) from storage.objects;").Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to verify Storage inventory."
    }
    if ([int64]$objectCount -ne 0) {
        throw "Storage contains objects. Create and verify a separate binary object backup before continuing."
    }

    & pg_dump `
        --dbname=$DatabaseUrl `
        --format=custom `
        --file=$dumpPath `
        --no-owner `
        --schema=public `
        --schema=supabase_migrations
    if ($LASTEXITCODE -ne 0) {
        throw "pg_dump failed."
    }

    & pg_restore --list $dumpPath | Out-File -LiteralPath $restoreListPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore could not verify the dump."
    }

    $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $dumpPath
    $restoreEntryCount = @(Get-Content -LiteralPath $restoreListPath).Count

    [ordered]@{
        created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        project_ref = $ExpectedProjectRef
        dump_file = [IO.Path]::GetFileName($dumpPath)
        sha256 = $hash.Hash
        restore_list_file = [IO.Path]::GetFileName($restoreListPath)
        restore_entry_count = $restoreEntryCount
        storage_object_count = [int64]$objectCount
        remote_write_performed = $false
    } | ConvertTo-Json | Out-File -LiteralPath $manifestPath -Encoding utf8

    [pscustomobject]@{
        Dump = $dumpPath
        Manifest = $manifestPath
        Sha256 = $hash.Hash
        RestoreEntries = $restoreEntryCount
    }
}
finally {
    $env:PGPASSWORD = $previousPgPassword
    $env:PGOPTIONS = $previousPgOptions
}
