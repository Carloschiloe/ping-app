param(
    [Parameter(Mandatory = $true)]
    [string]$DatabaseUrl,

    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,

    [string]$ExpectedProjectRef = 'oonijgmddgyymhrlnvuu',

    [int]$ExpectedPostgresMajor = 17,

    [string]$PostgresBinPath,

    [switch]$ConfirmEncryptedDestination,

    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$script:PostgresTools = @{}

function Get-ToolVersion {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Tool
    )

    $version = (& $Tool --version 2>$null | Select-Object -First 1)
    if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($version)) {
        throw "Unable to determine version for required tool: $Tool"
    }
    return $version.Trim()
}

function Assert-FileNotEmpty {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "$Description was not created."
    }

    $item = Get-Item -LiteralPath $Path
    if ($item.Length -le 0) {
        throw "$Description is empty."
    }
}

function Invoke-PsqlExport {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Sql,

        [Parameter(Mandatory = $true)]
        [string]$Path,

        [switch]$Csv
    )

    $arguments = @(
        "--dbname=$DatabaseUrl",
        '--no-psqlrc',
        '--quiet',
        '--set=ON_ERROR_STOP=1'
    )
    if ($Csv) {
        $arguments += '--csv'
    } else {
        $arguments += @('--tuples-only', '--no-align')
    }
    $guardedSql = @"
begin transaction read only;
$Sql
rollback;
"@
    $arguments += "--command=$guardedSql"

    $output = & $script:PostgresTools['psql'] @arguments 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "A required read-only catalog export failed."
    }

    $output | Out-File -LiteralPath $Path -Encoding utf8
    Assert-FileNotEmpty -Path $Path -Description ([IO.Path]::GetFileName($Path))
}

function Assert-ArchiveReadable {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ArchivePath,

        [Parameter(Mandatory = $true)]
        [string]$RestoreListPath,

        [Parameter(Mandatory = $true)]
        [string[]]$RequiredMarkers
    )

    Assert-FileNotEmpty -Path $ArchivePath -Description ([IO.Path]::GetFileName($ArchivePath))
    & $script:PostgresTools['pg_restore'] --list $ArchivePath |
        Out-File -LiteralPath $RestoreListPath -Encoding utf8
    if ($LASTEXITCODE -ne 0) {
        throw "pg_restore could not inspect $([IO.Path]::GetFileName($ArchivePath))."
    }
    Assert-FileNotEmpty -Path $RestoreListPath -Description ([IO.Path]::GetFileName($RestoreListPath))

    $restoreList = Get-Content -LiteralPath $RestoreListPath -Raw
    foreach ($marker in $RequiredMarkers) {
        if (-not $restoreList.Contains($marker)) {
            throw "Archive $([IO.Path]::GetFileName($ArchivePath)) is missing required marker: $marker"
        }
    }
}

function Assert-NoCredentialLeak {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Paths
    )

    $forbiddenValues = @(
        $env:PING_STAGING_DB_PASSWORD,
        $DatabaseUrl
    ) | Where-Object { -not [string]::IsNullOrEmpty($_) }

    foreach ($path in $Paths) {
        $content = Get-Content -LiteralPath $path -Raw
        foreach ($forbidden in $forbiddenValues) {
            if ($content.Contains($forbidden)) {
                throw "Credential material was detected in a generated text artifact."
            }
        }
    }
}

try {
    $parsedDatabaseUrl = [Uri]$DatabaseUrl
} catch {
    throw "DatabaseUrl must be a valid PostgreSQL connection URL."
}

if ($parsedDatabaseUrl.Scheme -notin @('postgres', 'postgresql')) {
    throw "DatabaseUrl must use the postgres or postgresql scheme."
}
$isSupabaseComHost = $parsedDatabaseUrl.Host.EndsWith(
    '.supabase.com',
    [StringComparison]::OrdinalIgnoreCase
)
$isSupabaseCoHost = $parsedDatabaseUrl.Host.EndsWith(
    '.supabase.co',
    [StringComparison]::OrdinalIgnoreCase
)
$isSupabaseHost = $isSupabaseComHost -or $isSupabaseCoHost
if (-not $isSupabaseHost) {
    throw "DatabaseUrl must target a Supabase-managed PostgreSQL host."
}
$hasPasswordInUserInfo = $parsedDatabaseUrl.UserInfo.Contains(':')
$hasPasswordInQuery = $parsedDatabaseUrl.Query -match '(?i)(^|[?&])password='
if ($hasPasswordInUserInfo -or $hasPasswordInQuery) {
    throw "DatabaseUrl must not contain a password. Use PING_STAGING_DB_PASSWORD."
}
if ($DatabaseUrl -notmatch [regex]::Escape($ExpectedProjectRef)) {
    throw "DatabaseUrl does not belong to the expected staging project."
}

$requiredTools = @('pg_dump', 'pg_dumpall', 'pg_restore', 'psql')
$candidateBinPaths = @()
if (-not [string]::IsNullOrWhiteSpace($PostgresBinPath)) {
    $candidateBinPaths += [IO.Path]::GetFullPath($PostgresBinPath)
} else {
    $pathCommand = Get-Command pg_dump -ErrorAction SilentlyContinue
    if ($pathCommand) {
        $candidateBinPaths += Split-Path -Parent $pathCommand.Source
    }

    $postgresInstallRoot = 'C:\Program Files\PostgreSQL'
    if (Test-Path -LiteralPath $postgresInstallRoot -PathType Container) {
        $candidateBinPaths += Get-ChildItem -LiteralPath $postgresInstallRoot -Directory |
            ForEach-Object { Join-Path $_.FullName 'bin' }
    }
}

$compatibleToolSets = @()
foreach ($candidate in ($candidateBinPaths | Select-Object -Unique)) {
    $paths = [ordered]@{}
    $complete = $true
    foreach ($tool in $requiredTools) {
        $executable = Join-Path $candidate "$tool.exe"
        if (-not (Test-Path -LiteralPath $executable -PathType Leaf)) {
            $complete = $false
            break
        }
        $paths[$tool] = $executable
    }
    if (-not $complete) {
        continue
    }

    $pgDumpVersion = Get-ToolVersion -Tool $paths['pg_dump']
    if ($pgDumpVersion -notmatch '(\d+)(?:\.\d+)?\s*$') {
        continue
    }
    $compatibleToolSets += [pscustomobject]@{
        Major = [int]$matches[1]
        BinPath = $candidate
        Paths = $paths
    }
}

$selectedToolSet = $compatibleToolSets |
    Where-Object { $_.Major -ge $ExpectedPostgresMajor } |
    Sort-Object Major |
    Select-Object -First 1
if (-not $selectedToolSet) {
    throw "PostgreSQL client tools version $ExpectedPostgresMajor or newer are required."
}

$script:PostgresTools = $selectedToolSet.Paths
$toolVersions = [ordered]@{}
foreach ($tool in $requiredTools) {
    $toolVersions[$tool] = [ordered]@{
        version = Get-ToolVersion -Tool $script:PostgresTools[$tool]
        executable = $script:PostgresTools[$tool]
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
    throw "Backups must be written outside the Git repository."
}
if (-not $ConfirmEncryptedDestination) {
    throw "Use -ConfirmEncryptedDestination only after selecting encrypted storage."
}

if ($ValidateOnly) {
    [ordered]@{
        valid = $true
        project_ref = $ExpectedProjectRef
        output_directory = $resolvedOutput
        tools = $toolVersions
        expected_postgres_major = $ExpectedPostgresMajor
        password_required_for_remote_backup = $true
        writes_remote_data = $false
        backup_scope = @(
            'public schema and data',
            'supabase_migrations schema and data',
            'public functions, triggers, RLS policies and grants',
            'storage schema and metadata',
            'storage.objects policies, buckets and object inventory',
            'database roles without passwords',
            'Realtime publication inventory',
            'catalog evidence and restoration instructions'
        )
    } | ConvertTo-Json -Depth 5
    return
}

if (-not (Test-Path Env:PING_STAGING_DB_PASSWORD)) {
    throw "PING_STAGING_DB_PASSWORD is required for a remote backup."
}
if ([string]::IsNullOrWhiteSpace($env:PING_STAGING_DB_PASSWORD)) {
    throw "PING_STAGING_DB_PASSWORD is empty."
}

$previousPgPassword = $env:PGPASSWORD
$previousPgOptions = $env:PGOPTIONS
$workingDirectory = $null
$finalDirectory = $null
$backupArtifactsCreated = $false

try {
    $env:PGPASSWORD = $env:PING_STAGING_DB_PASSWORD
    $env:PGOPTIONS = '-c default_transaction_read_only=on'

    $readOnlyValidationSql = @"
begin transaction read only;
select json_build_object(
    'server_version', current_setting('server_version'),
    'server_version_num', current_setting('server_version_num'),
    'database_name', current_database(),
    'current_role', current_user,
    'transaction_read_only', current_setting('transaction_read_only'),
    'read_only_probe', 1
)::text;
rollback;
"@
    $validationOutput = @(
        & $script:PostgresTools['psql'] "--dbname=$DatabaseUrl" --no-psqlrc `
            --quiet --set=ON_ERROR_STOP=1 --tuples-only --no-align `
            "--command=$readOnlyValidationSql" 2>$null
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to establish and roll back a read-only validation transaction."
    }
    $databaseEvidence = $validationOutput |
        Where-Object { $_.Trim().StartsWith('{') } |
        Select-Object -Last 1
    if ([string]::IsNullOrWhiteSpace($databaseEvidence)) {
        throw "Read-only validation did not return PostgreSQL evidence."
    }
    $databaseMetadata = $databaseEvidence | ConvertFrom-Json
    $transactionIsReadOnly = $databaseMetadata.transaction_read_only -eq 'on'
    $probeSucceeded = [int]$databaseMetadata.read_only_probe -eq 1
    if (-not $transactionIsReadOnly -or -not $probeSucceeded) {
        throw "Explicit read-only transaction validation failed."
    }
    $serverMajor = [int](($databaseMetadata.server_version -split '\.')[0])
    if ($selectedToolSet.Major -lt $serverMajor) {
        throw "Selected PostgreSQL client tools are older than the staging server."
    }

    $storageCountSql = @"
begin transaction read only;
select count(*) from storage.objects;
rollback;
"@
    $storageCountOutput = @(
        & $script:PostgresTools['psql'] "--dbname=$DatabaseUrl" --no-psqlrc `
            --quiet --set=ON_ERROR_STOP=1 --tuples-only --no-align `
            "--command=$storageCountSql" 2>$null
    )
    if ($LASTEXITCODE -ne 0) {
        throw "Unable to verify the Storage object inventory."
    }
    $storageObjectCount = $storageCountOutput |
        Where-Object { $_.Trim() -match '^\d+$' } |
        Select-Object -Last 1
    if ([string]::IsNullOrWhiteSpace($storageObjectCount)) {
        throw "Storage object inventory did not return a valid count."
    }
    if ([int64]$storageObjectCount -ne 0) {
        throw "Storage contains binary objects. A verified binary object backup is required before this database backup can be marked complete."
    }

    New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
    $timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
    $backupName = "ping-staging-pre-private-files-$timestamp"
    $workingDirectory = Join-Path $resolvedOutput "$backupName.incomplete"
    $finalDirectory = Join-Path $resolvedOutput $backupName

    $workingTargetExists = Test-Path -LiteralPath $workingDirectory
    $finalTargetExists = Test-Path -LiteralPath $finalDirectory
    if ($workingTargetExists -or $finalTargetExists) {
        throw "Backup target already exists."
    }

    New-Item -ItemType Directory -Path $workingDirectory | Out-Null
    $backupArtifactsCreated = $true
    $incompleteMarker = Join-Path $workingDirectory 'INCOMPLETE.txt'
    'This backup is incomplete and must not be used.' |
        Out-File -LiteralPath $incompleteMarker -Encoding utf8

    $applicationDump = Join-Path $workingDirectory 'application.dump'
    $applicationList = Join-Path $workingDirectory 'application.restore-list.txt'
    $storageDump = Join-Path $workingDirectory 'storage-metadata.dump'
    $storageList = Join-Path $workingDirectory 'storage-metadata.restore-list.txt'
    $rolesFile = Join-Path $workingDirectory 'roles-without-passwords.sql'

    & $script:PostgresTools['pg_dump'] "--dbname=$DatabaseUrl" --format=custom "--file=$applicationDump" `
        --no-owner --serializable-deferrable --schema=public --schema=supabase_migrations
    if ($LASTEXITCODE -ne 0) {
        throw "Application pg_dump failed."
    }

    & $script:PostgresTools['pg_dump'] "--dbname=$DatabaseUrl" --format=custom "--file=$storageDump" `
        --no-owner --serializable-deferrable --schema=storage
    if ($LASTEXITCODE -ne 0) {
        throw "Storage metadata pg_dump failed."
    }

    & $script:PostgresTools['pg_dumpall'] "--dbname=$DatabaseUrl" --roles-only --no-role-passwords `
        "--file=$rolesFile"
    if ($LASTEXITCODE -ne 0) {
        throw "Role metadata export failed."
    }

    Assert-ArchiveReadable -ArchivePath $applicationDump `
        -RestoreListPath $applicationList `
        -RequiredMarkers @('SCHEMA - public', 'SCHEMA - supabase_migrations')
    Assert-ArchiveReadable -ArchivePath $storageDump `
        -RestoreListPath $storageList `
        -RequiredMarkers @('SCHEMA - storage', 'TABLE DATA storage buckets')
    Assert-FileNotEmpty -Path $rolesFile -Description 'roles-without-passwords.sql'
    if (Select-String -LiteralPath $rolesFile -Pattern '\bPASSWORD\b' -Quiet) {
        throw "Role export unexpectedly contains password material."
    }

    $databaseMetadataPath = Join-Path $workingDirectory 'database-metadata.json'
    $databaseEvidence |
        Out-File -LiteralPath $databaseMetadataPath -Encoding utf8
    Assert-FileNotEmpty -Path $databaseMetadataPath `
        -Description 'database-metadata.json'

    $catalogExports = [ordered]@{
        'schema-columns.csv' = @"
select table_schema, table_name, ordinal_position, column_name, data_type,
       is_nullable, column_default
from information_schema.columns
where table_schema in ('public', 'storage', 'supabase_migrations')
order by table_schema, table_name, ordinal_position;
"@
        'table-security.csv' = @"
select n.nspname as schema_name, c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       c.relforcerowsecurity as rls_forced,
       pg_get_userbyid(c.relowner) as table_owner
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relkind in ('r', 'p')
  and n.nspname in ('public', 'storage', 'supabase_migrations')
order by n.nspname, c.relname;
"@
        'rls-policies.csv' = @"
select schemaname, tablename, policyname, permissive,
       array_to_string(roles, ',') as roles, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;
"@
        'table-grants.csv' = @"
select grantor, grantee, table_schema, table_name, privilege_type, is_grantable
from information_schema.role_table_grants
where table_schema in ('public', 'storage', 'supabase_migrations')
order by table_schema, table_name, grantee, privilege_type;
"@
        'routine-grants.csv' = @"
select grantor, grantee, routine_schema, routine_name,
       privilege_type, is_grantable
from information_schema.role_routine_grants
where routine_schema in ('public', 'storage')
order by routine_schema, routine_name, grantee, privilege_type;
"@
        'functions.csv' = @"
select n.nspname as schema_name, p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as identity_arguments,
       pg_get_function_result(p.oid) as result_type,
       p.prokind, p.prosecdef as security_definer, p.provolatile
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'storage')
order by n.nspname, p.proname, identity_arguments;
"@
        'triggers.csv' = @"
select n.nspname as schema_name, c.relname as table_name,
       t.tgname as trigger_name, pg_get_triggerdef(t.oid, true) as definition
from pg_catalog.pg_trigger t
join pg_catalog.pg_class c on c.oid = t.tgrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal and n.nspname in ('public', 'storage')
order by n.nspname, c.relname, t.tgname;
"@
        'realtime-publications.csv' = @"
select p.pubname, p.puballtables, p.pubinsert, p.pubupdate, p.pubdelete,
       pt.schemaname, pt.tablename
from pg_catalog.pg_publication p
left join pg_catalog.pg_publication_tables pt on pt.pubname = p.pubname
order by p.pubname, pt.schemaname, pt.tablename;
"@
        'storage-buckets.csv' = @"
select id, name, public, file_size_limit, allowed_mime_types,
       created_at, updated_at
from storage.buckets
order by id;
"@
        'storage-objects.csv' = @"
select id, bucket_id, name, owner_id, created_at, updated_at,
       last_accessed_at, metadata
from storage.objects
order by bucket_id, name;
"@
        'migration-history.csv' = @"
select *
from supabase_migrations.schema_migrations
order by version;
"@
    }

    $textArtifacts = @(
        $applicationList,
        $storageList,
        $rolesFile,
        $databaseMetadataPath
    )
    foreach ($entry in $catalogExports.GetEnumerator()) {
        $exportPath = Join-Path $workingDirectory $entry.Key
        Invoke-PsqlExport -Sql $entry.Value -Path $exportPath -Csv
        $textArtifacts += $exportPath
    }

    $restoreInstructions = Join-Path $workingDirectory 'RESTORE-AND-VERIFY.md'
    @"
# Restore and verification

Project ref: $ExpectedProjectRef

1. Verify every SHA-256 value in `manifest.json`.
2. Verify `manifest.json` with `manifest.sha256`.
3. Inspect both custom archives with `pg_restore --list`.
4. Restore only into an isolated recovery project first.
5. Restore roles only after reviewing `roles-without-passwords.sql`.
6. Restore `application.dump` with `pg_restore`; it contains `public` and
   `supabase_migrations`, including data and post-data objects.
7. Treat `storage-metadata.dump` as recovery evidence for the managed Storage
   schema. Review it before any selective restore into Supabase.
8. Compare catalog CSV files after restore: RLS, grants, functions, triggers,
   publications, buckets, objects and migration history.
9. This backup contains no Storage binaries. The script only succeeds when the
   pre-change object count is zero.
10. Never restore directly over production or staging without a separately
    approved recovery plan.
"@ | Out-File -LiteralPath $restoreInstructions -Encoding utf8
    Assert-FileNotEmpty -Path $restoreInstructions -Description 'RESTORE-AND-VERIFY.md'
    $textArtifacts += $restoreInstructions

    Assert-NoCredentialLeak -Paths $textArtifacts

    $payloadPurposes = [ordered]@{
        'application.dump' = 'public and supabase_migrations schema/data'
        'application.restore-list.txt' = 'pg_restore inspection of application.dump'
        'storage-metadata.dump' = 'managed Storage schema and metadata recovery evidence'
        'storage-metadata.restore-list.txt' = 'pg_restore inspection of storage-metadata.dump'
        'roles-without-passwords.sql' = 'database roles without role passwords'
        'database-metadata.json' = 'PostgreSQL version and read-only session evidence'
        'schema-columns.csv' = 'column-level schema inventory'
        'table-security.csv' = 'RLS enabled/forced state and table ownership'
        'rls-policies.csv' = 'effective public and Storage RLS policy definitions'
        'table-grants.csv' = 'table grants'
        'routine-grants.csv' = 'routine grants'
        'functions.csv' = 'function inventory'
        'triggers.csv' = 'trigger inventory and definitions'
        'realtime-publications.csv' = 'Realtime publication membership'
        'storage-buckets.csv' = 'Storage bucket configuration'
        'storage-objects.csv' = 'Storage object metadata inventory'
        'migration-history.csv' = 'Supabase migration history'
        'RESTORE-AND-VERIFY.md' = 'restore and verification procedure'
    }

    $fileEvidence = @()
    foreach ($entry in $payloadPurposes.GetEnumerator()) {
        $path = Join-Path $workingDirectory $entry.Key
        Assert-FileNotEmpty -Path $path -Description $entry.Key
        $item = Get-Item -LiteralPath $path
        $fileEvidence += [ordered]@{
            file = $entry.Key
            purpose = $entry.Value
            bytes = $item.Length
            sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash
        }
    }

    $validationChecks = @(
        'project ref matched connection URL',
        'password supplied only through PING_STAGING_DB_PASSWORD',
        'BEGIN READ ONLY transaction confirmed transaction_read_only=on',
        'innocuous read-only probe succeeded and validation transaction rolled back',
        'catalog exports executed inside explicit read-only transactions',
        'pg_dump archives requested serializable read-only deferrable transactions',
        'Storage binary object count confirmed as zero',
        'application archive inspected with pg_restore',
        'Storage metadata archive inspected with pg_restore',
        'required archive markers found',
        'roles exported without passwords',
        'all mandatory files are non-empty',
        'credential values absent from generated text artifacts',
        'SHA-256 calculated for every payload file'
    )

    $repositoryHead = (git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $repositoryHead -notmatch '^[0-9a-f]{40}$') {
        throw "Unable to record the repository HEAD."
    }
    $sourceScriptHash = (
        Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256
    ).Hash

    $manifestPath = Join-Path $workingDirectory 'manifest.json'
    [ordered]@{
        format_version = 2
        validation_status = 'passed'
        project_ref = $ExpectedProjectRef
        created_at_utc = (Get-Date).ToUniversalTime().ToString('o')
        source = [ordered]@{
            repository_head = $repositoryHead
            script = 'scripts/backup-staging-readonly.ps1'
            script_sha256 = $sourceScriptHash
        }
        postgres = [ordered]@{
            server_version = $databaseMetadata.server_version
            server_version_num = $databaseMetadata.server_version_num
            database_name = $databaseMetadata.database_name
            transaction_read_only = $databaseMetadata.transaction_read_only
        }
        tools = $toolVersions
        files = $fileEvidence
        scope = [ordered]@{
            included = @(
                'public schema and data',
                'supabase_migrations schema and data',
                'functions, triggers, RLS policies and grants',
                'Realtime publication inventory',
                'Storage schema, bucket configuration and object metadata',
                'roles without passwords',
                'catalog evidence required to compare a recovery'
            )
            excluded = @(
                'Storage binary contents; execution fails unless object count is zero',
                'auth schema and managed platform schemas other than storage',
                'database role passwords and application secrets',
                'provider configuration outside PostgreSQL',
                'point-in-time recovery configuration managed by Supabase'
            )
        }
        storage_object_count = [int64]$storageObjectCount
        validation = [ordered]@{
            result = 'passed'
            checks = $validationChecks
        }
        restoration = 'See RESTORE-AND-VERIFY.md. Always validate in an isolated recovery project.'
        remote_write_performed = $false
    } | ConvertTo-Json -Depth 8 |
        Out-File -LiteralPath $manifestPath -Encoding utf8
    Assert-FileNotEmpty -Path $manifestPath -Description 'manifest.json'
    Assert-NoCredentialLeak -Paths @($manifestPath)

    $manifestHashPath = Join-Path $workingDirectory 'manifest.sha256'
    $manifestHash = Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256
    "$($manifestHash.Hash)  manifest.json" |
        Out-File -LiteralPath $manifestHashPath -Encoding ascii
    Assert-FileNotEmpty -Path $manifestHashPath -Description 'manifest.sha256'

    Move-Item -LiteralPath $workingDirectory -Destination $finalDirectory
    $finalIncompleteMarker = Join-Path $finalDirectory 'INCOMPLETE.txt'
    Remove-Item -LiteralPath $finalIncompleteMarker -Force
    $workingDirectory = $null

    [ordered]@{
        validation_status = 'passed'
        project_ref = $ExpectedProjectRef
        backup_directory = $finalDirectory
        manifest = 'manifest.json'
        manifest_sha256 = $manifestHash.Hash
        payload_file_count = $fileEvidence.Count
        storage_object_count = [int64]$storageObjectCount
        remote_write_performed = $false
    } | ConvertTo-Json
} catch {
    $originalError = $_
    if ($backupArtifactsCreated) {
        foreach ($candidate in @($workingDirectory, $finalDirectory)) {
            if ([string]::IsNullOrWhiteSpace($candidate)) {
                continue
            }
            $candidateExists = Test-Path -LiteralPath $candidate -PathType Container
            $candidateMarker = Join-Path $candidate 'INCOMPLETE.txt'
            if ($candidateExists -and (Test-Path -LiteralPath $candidateMarker -PathType Leaf)) {
                try {
                    $fullCandidate = [IO.Path]::GetFullPath($candidate).TrimEnd('\')
                    $fullOutput = [IO.Path]::GetFullPath($resolvedOutput).TrimEnd('\')
                    if (-not $fullCandidate.StartsWith(
                        "$fullOutput\",
                        [StringComparison]::OrdinalIgnoreCase
                    )) {
                        throw "Incomplete backup path escaped the configured destination."
                    }
                    Remove-Item -LiteralPath $fullCandidate -Recurse -Force
                } catch {
                    Write-Warning "Automatic cleanup of an incomplete backup failed."
                }
            }
        }
    }
    throw $originalError
} finally {
    $env:PGPASSWORD = $previousPgPassword
    $env:PGOPTIONS = $previousPgOptions
}
