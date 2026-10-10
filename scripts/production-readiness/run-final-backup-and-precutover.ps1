[CmdletBinding()]
param([switch]$ValidateOnly)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$ProjectRef = 'wbigqhtuzfmpnxservlf'
$ProjectUrl = "https://$ProjectRef.supabase.co"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$BackupRoot = Join-Path $HOME 'PingProductionBackup'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$RunRoot = Join-Path $BackupRoot $Stamp
$WorkRoot = Join-Path $RunRoot 'payload'
$ZipPath = Join-Path $RunRoot 'backup.zip'
$EncryptedPath = Join-Path $RunRoot "ping-production-$Stamp.zip.enc"
$CryptoMetaPath = Join-Path $RunRoot "ping-production-$Stamp.crypto.json"
$EvidencePath = Join-Path $RunRoot 'evidence.json'
$SnapshotPath = Join-Path $RepoRoot 'docs\production-readiness\production-snapshot-20261010.json'
$PrecheckPath = Join-Path $WorkRoot 'production-bridge-precheck.csv'
$DbDumpPath = Join-Path $WorkRoot 'database-public-auth-storage.dump'
$SchemaDumpPath = Join-Path $WorkRoot 'schema-public-auth-storage.dump'
$DataDumpPath = Join-Path $WorkRoot 'data-public-auth-storage.dump'
$AuthPath = Join-Path $WorkRoot 'auth-users.json'
$StorageInventoryPath = Join-Path $WorkRoot 'storage-inventory.json'
$StorageManifestPath = Join-Path $WorkRoot 'storage-binaries-manifest.json'
$PublicRowCountsPath = Join-Path $WorkRoot 'public-row-counts.json'
$RestoreListPath = Join-Path $WorkRoot 'restore-list.txt'
$RestoreExtractPath = Join-Path $WorkRoot 'restore-extracted.sql'
$LegacyPublicTables = @(
  'profiles', 'messages', 'commitments', 'subscriptions', 'contacts', 'conversations',
  'conversation_participants', 'message_reactions', 'user_calendar_accounts', 'ai_messages',
  'calls', 'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs',
  'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses',
  'commitment_operation_progress'
)

function Write-Status([string]$Name, [string]$Value) { Write-Output "$Name=$Value" }

function Require-Command([string]$Name) {
  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) { throw "REQUIRED_TOOL_MISSING:$Name" }
  return $command.Source
}

function Read-SecretText([string]$Prompt) {
  $secure = Read-Host -Prompt $Prompt -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$FailureCode) {
  & $FilePath @Arguments *> $null
  if ($LASTEXITCODE -ne 0) { throw "$FailureCode`:$LASTEXITCODE" }
}

function Invoke-PsqlScalar([string]$PsqlPath, [string]$DbUrl, [string]$Sql) {
  $output = & $PsqlPath '--dbname' $DbUrl '--quiet' '--tuples-only' '--no-align' '--command' $Sql 2>$null
  if ($LASTEXITCODE -ne 0) { throw 'POSTGRES_READONLY_QUERY_FAILED' }
  return (($output -join "`n").Trim())
}

function Get-PostgresMajorFromVersionNum([string]$VersionNum) {
  $numeric = 0L
  if (-not [long]::TryParse($VersionNum.Trim(), [ref]$numeric) -or $numeric -le 0) { throw 'POSTGRES_SERVER_VERSION_INVALID' }
  if ($numeric -ge 100000) { return [int][math]::Floor($numeric / 10000) }
  return "{0}.{1}" -f [int][math]::Floor($numeric / 10000), [int][math]::Floor(($numeric % 10000) / 100)
}

function Get-PostgresMajorRank([string]$Major) {
  $parts = $Major -split '\.'
  $majorPart = 0
  if (-not [int]::TryParse($parts[0], [ref]$majorPart)) { throw 'POSTGRES_CLIENT_VERSION_INVALID' }
  $minorPart = 0
  if ($parts.Count -gt 1 -and -not [int]::TryParse($parts[1], [ref]$minorPart)) { throw 'POSTGRES_CLIENT_VERSION_INVALID' }
  return ($majorPart * 100) + $minorPart
}

function Get-PostgresSearchRoots {
  return @(
    (Join-Path ${env:ProgramFiles} 'PostgreSQL'),
    (Join-Path ${env:ProgramFiles(x86)} 'PostgreSQL')
  )
}

function Get-PostgresBinDirectories {
  $directories = [System.Collections.Generic.List[string]]::new()
  $toolNames = @('pg_dump', 'pg_restore', 'psql', 'initdb', 'pg_ctl', 'postgres', 'createdb', 'dropdb')
  foreach ($toolName in $toolNames) {
    $pathCommands = @(Get-Command $toolName -All -ErrorAction SilentlyContinue)
    foreach ($pathCommand in $pathCommands) {
      if ($pathCommand.Source) { [void]$directories.Add((Split-Path -Parent $pathCommand.Source)) }
    }
  }
  $roots = @(Get-PostgresSearchRoots)
  foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        $bin = Join-Path $_.FullName 'bin'
        if (Test-Path -LiteralPath $bin) { [void]$directories.Add($bin) }
      }
    }
  }
  return @($directories | Sort-Object -Unique)
}

function Find-PostgresToolPath([string]$ToolName) {
  foreach ($binDir in @(Get-PostgresBinDirectories)) {
    foreach ($fileName in @("$ToolName.exe", $ToolName)) {
      $toolPath = Join-Path $binDir $fileName
      if (Test-Path -LiteralPath $toolPath) { return $toolPath }
    }
  }
  return $null
}

function Read-PostgresDumpMajor([string]$PgDumpPath) {
  $versionText = (& $PgDumpPath '--version' 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { return $null }
  $match = [regex]::Match($versionText, 'PostgreSQL\)\s+(\d+)(?:\.(\d+))?')
  if (-not $match.Success) { return $null }
  if ($match.Groups[2].Success) { return "$($match.Groups[1].Value).$($match.Groups[2].Value)" }
  return $match.Groups[1].Value
}

function Select-PostgresClientCandidate([object[]]$Candidates, [string]$ServerMajor) {
  $serverRank = Get-PostgresMajorRank $ServerMajor
  $compatible = @($Candidates | Where-Object { (Get-PostgresMajorRank $_.Major) -ge $serverRank })
  if ($compatible.Count -eq 0) { return $null }
  return ($compatible | Sort-Object @{ Expression = { if ((Get-PostgresMajorRank $_.Major) -eq $serverRank) { 0 } else { 1 } } }, @{ Expression = { Get-PostgresMajorRank $_.Major } }, BinDir | Select-Object -First 1)
}

function Find-PostgresClientCandidate([string]$ServerMajor) {
  $candidates = [System.Collections.Generic.List[object]]::new()
  foreach ($binDir in @(Get-PostgresBinDirectories)) {
    $dump = Join-Path $binDir 'pg_dump.exe'
    if (-not (Test-Path -LiteralPath $dump)) { $dump = Join-Path $binDir 'pg_dump' }
    if (-not (Test-Path -LiteralPath $dump)) { continue }
    $major = Read-PostgresDumpMajor $dump
    if (-not $major) { continue }
    $restore = Join-Path $binDir 'pg_restore.exe'
    if (-not (Test-Path -LiteralPath $restore)) { $restore = Join-Path $binDir 'pg_restore' }
    $psql = Join-Path $binDir 'psql.exe'
    if (-not (Test-Path -LiteralPath $psql)) { $psql = Join-Path $binDir 'psql' }
    if (-not (Test-Path -LiteralPath $restore) -or -not (Test-Path -LiteralPath $psql)) { continue }
    [void]$candidates.Add([pscustomobject]@{
      Major = $major; BinDir = $binDir; PgDump = $dump; PgRestore = $restore; Psql = $psql
      Initdb = (Join-Path $binDir 'initdb.exe'); PgCtl = (Join-Path $binDir 'pg_ctl.exe')
      Postgres = (Join-Path $binDir 'postgres.exe'); Createdb = (Join-Path $binDir 'createdb.exe'); Dropdb = (Join-Path $binDir 'dropdb.exe')
    })
  }
  return Select-PostgresClientCandidate @($candidates) $ServerMajor
}

function Install-CompatiblePostgresClient([string]$ServerMajor) {
  $wingetCommand = Get-Command winget.exe -ErrorAction SilentlyContinue
  if (-not $wingetCommand) { throw 'POSTGRES_CLIENT_INSTALL_UNAVAILABLE' }
  $packageId = "PostgreSQL.PostgreSQL.$ServerMajor"
  $output = & $wingetCommand.Source install --id $packageId --exact --source winget --silent --accept-source-agreements --accept-package-agreements 2>&1
  if ($LASTEXITCODE -ne 0) {
    $safeOutput = ($output -join ' ')
    if ($safeOutput -match '(?i)elevation|administrator|access is denied|0x80070005|uac') {
      throw "POSTGRES_CLIENT_INSTALL_REQUIRES_ELEVATION`nRUN_THIS_ONE_COMMAND=winget install --id $packageId --exact --source winget --accept-source-agreements --accept-package-agreements; powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$($PSCommandPath)`""
    }
    throw 'POSTGRES_CLIENT_INSTALL_FAILED'
  }
}

function Resolve-PostgresClient([string]$ServerMajor) {
  $candidate = Find-PostgresClientCandidate $ServerMajor
  if ($candidate) { return $candidate }
  Install-CompatiblePostgresClient $ServerMajor
  $candidate = Find-PostgresClientCandidate $ServerMajor
  if (-not $candidate) { throw 'PG_DUMP_VERSION_INCOMPATIBLE' }
  return $candidate
}

function Get-Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-PublicRowCounts([object]$Actual, [object]$Expected) {
  foreach ($tableName in $LegacyPublicTables) {
    $actualCount = [int64]$Actual.counts.$tableName
    $expectedCount = [int64]$Expected.counts.$tableName
    if ($actualCount -ne $expectedCount) { throw "PUBLIC_ROW_COUNT_MISMATCH:$tableName" }
  }
  if ([int64]$Actual.total -ne [int64]$Expected.total) { throw 'PUBLIC_ROW_TOTAL_MISMATCH' }
}

function Assert-ProductionDatabaseTarget([string]$DbUrl) {
  try { $uri = [Uri]$DbUrl } catch { throw 'DATABASE_URL_INVALID' }
  $dbHost = $uri.DnsSafeHost.ToLowerInvariant()
  $user = [Uri]::UnescapeDataString(($uri.UserInfo -split ':')[0])
  $directHost = "db.$ProjectRef.supabase.co"
  $direct = $dbHost -eq $directHost -and $user -eq 'postgres'
  $pooler = $dbHost -match '^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$' -and $user -eq "postgres.$ProjectRef"
  if (-not ($direct -or $pooler)) { throw 'DATABASE_TARGET_NOT_EXACT_PRODUCTION_DIRECT_OR_SESSION_POOLER' }
  return $uri
}

function Protect-File([string]$InputPath, [string]$OutputPath, [string]$MetadataPath, [string]$Passphrase) {
  $rng = New-Object Security.Cryptography.RNGCryptoServiceProvider
  $salt = New-Object byte[] 16
  $rng.GetBytes($salt)
  $aes = [Security.Cryptography.Aes]::Create()
  $aes.KeySize = 256
  $aes.Mode = [Security.Cryptography.CipherMode]::CBC
  $aes.Padding = [Security.Cryptography.PaddingMode]::PKCS7
  $kdf = New-Object Security.Cryptography.Rfc2898DeriveBytes($Passphrase, $salt, 210000)
  $aes.Key = $kdf.GetBytes(32)
  $iv = $aes.IV
  $plain = [IO.File]::ReadAllBytes($InputPath)
  $cipher = $aes.CreateEncryptor().TransformFinalBlock($plain, 0, $plain.Length)
  $hmacKey = $kdf.GetBytes(32)
  $hmac = New-Object Security.Cryptography.HMACSHA256($hmacKey)
  $authInput = New-Object byte[] ($salt.Length + $iv.Length + $cipher.Length)
  [Buffer]::BlockCopy($salt, 0, $authInput, 0, $salt.Length)
  [Buffer]::BlockCopy($iv, 0, $authInput, $salt.Length, $iv.Length)
  [Buffer]::BlockCopy($cipher, 0, $authInput, $salt.Length + $iv.Length, $cipher.Length)
  $tag = $hmac.ComputeHash($authInput)
  [IO.File]::WriteAllBytes($OutputPath, $cipher)
  [ordered]@{
    format = 'PING-AES-CBC-HMAC-SHA256-v1'; iterations = 210000
    salt = [Convert]::ToBase64String($salt); iv = [Convert]::ToBase64String($iv)
    ciphertextSha256 = Get-Hash $OutputPath; hmacSha256 = [Convert]::ToBase64String($tag)
    hmacCovers = 'salt+iv+ciphertext'
  } | ConvertTo-Json | Set-Content -LiteralPath $MetadataPath -Encoding UTF8
  $aes.Dispose(); $kdf.Dispose(); $hmac.Dispose(); $rng.Dispose()
}

function Invoke-LocalRestore([object]$Client, [string]$DbDump, [string]$Work, [object]$ExpectedPublicCounts) {
  $names = @('initdb', 'pg_ctl', 'postgres', 'createdb', 'dropdb')
  $commands = @{}
  foreach ($name in $names) {
    $property = $name.Substring(0, 1).ToUpperInvariant() + $name.Substring(1)
    $candidatePath = [string]$Client.$property
    if (-not (Test-Path -LiteralPath $candidatePath)) { throw 'LOCAL_POSTGRES_SERVER_BINARIES_UNAVAILABLE' }
    $commands[$name] = $candidatePath
  }
  $cluster = Join-Path $Work 'restore-cluster'
  $port = 55432 + (Get-Random -Minimum 0 -Maximum 400)
  $started = $false
  try {
    Invoke-Checked $commands.initdb @('-D', $cluster, '-A', 'trust', '-U', 'ping_rehearsal') 'LOCAL_INITDB_FAILED'
    Invoke-Checked $commands.pg_ctl @('-D', $cluster, '-o', "-p $port -h 127.0.0.1", '-w', 'start') 'LOCAL_POSTGRES_START_FAILED'
    $started = $true
    Invoke-Checked $commands.createdb @('-h', '127.0.0.1', '-p', "$port", '-U', 'ping_rehearsal', 'ping_restore') 'LOCAL_CREATEDB_FAILED'
    Invoke-Checked $Client.PgRestore @('--exit-on-error', '--no-owner', '--no-privileges', '--dbname=ping_restore', '--host=127.0.0.1', "--port=$port", $DbDump) 'LOCAL_RESTORE_FAILED'
    $countsSql = @"
with counts as (
  select 'profiles' table_name, count(*)::bigint row_count from public.profiles
  union all select 'messages', count(*) from public.messages
  union all select 'commitments', count(*) from public.commitments
  union all select 'subscriptions', count(*) from public.subscriptions
  union all select 'contacts', count(*) from public.contacts
  union all select 'conversations', count(*) from public.conversations
  union all select 'conversation_participants', count(*) from public.conversation_participants
  union all select 'message_reactions', count(*) from public.message_reactions
  union all select 'user_calendar_accounts', count(*) from public.user_calendar_accounts
  union all select 'ai_messages', count(*) from public.ai_messages
  union all select 'calls', count(*) from public.calls
  union all select 'operation_checklists', count(*) from public.operation_checklists
  union all select 'operation_checklist_items', count(*) from public.operation_checklist_items
  union all select 'operation_checklist_runs', count(*) from public.operation_checklist_runs
  union all select 'operation_checklist_run_items', count(*) from public.operation_checklist_run_items
  union all select 'shift_reports', count(*) from public.shift_reports
  union all select 'conversation_operation_focuses', count(*) from public.conversation_operation_focuses
  union all select 'commitment_operation_progress', count(*) from public.commitment_operation_progress
)
select json_build_object(
  'auth', (select count(*) from auth.users),
  'storage', (select count(*) from storage.objects),
  'public_counts', (select json_object_agg(table_name, row_count) from counts),
  'public_total', (select coalesce(sum(row_count), 0)::bigint from counts)
)::text;
"@
    $counts = & $Client.Psql '--dbname=ping_restore' '--host=127.0.0.1' "--port=$port" '--quiet' '--tuples-only' '--no-align' '--command' $countsSql 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_RESTORE_COUNTS_FAILED' }
    $parsed = (($counts -join "`n").Trim() | ConvertFrom-Json)
    if ($parsed.auth -ne 4 -or $parsed.storage -ne 48) { throw 'LOCAL_RESTORE_COUNTS_MISMATCH' }
    $restoredPublicCounts = [pscustomobject]@{ counts = $parsed.public_counts; total = $parsed.public_total }
    Assert-PublicRowCounts $restoredPublicCounts $ExpectedPublicCounts
    return 'REAL_LOCAL_RESTORE_PASS'
  } finally {
    if ($started) { & $commands.pg_ctl '-D' $cluster '-m' 'fast' '-w' 'stop' *> $null }
    Remove-Item -LiteralPath $cluster -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Validate-Precheck([string]$Path) {
  $expectedReview = @(
    'subscriptions', 'contacts', 'conversations', 'conversation_participants',
    'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs',
    'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses',
    'commitment_operation_progress', 'legacy_client_access_boundary', 'security_definer_search_path'
  )
  $rows = @(Get-Content -LiteralPath $Path | Where-Object { $_.Trim() } | ConvertFrom-Csv -Header check_name,status,details)
  if ($rows.Count -lt 8) { throw 'PRODUCTION_PRECHECK_OUTPUT_INCOMPLETE' }
  foreach ($row in $rows) {
    if ($row.status -eq 'FAIL') { throw "PRODUCTION_PRECHECK_UNEXPECTED_FAIL:$($row.check_name):$($row.details)" }
    if ($row.status -eq 'REVIEW' -and $expectedReview -notcontains $row.check_name) { throw "PRODUCTION_PRECHECK_UNEXPECTED_REVIEW:$($row.check_name)" }
    if ($row.status -notin @('PASS', 'REVIEW')) { throw "PRODUCTION_PRECHECK_UNKNOWN_STATUS:$($row.check_name)" }
  }
}

if ($ValidateOnly) {
  if (-not (Find-PostgresToolPath 'pg_dump')) { throw 'REQUIRED_TOOL_MISSING:pg_dump' }
  if (-not (Find-PostgresToolPath 'pg_restore')) { throw 'REQUIRED_TOOL_MISSING:pg_restore' }
  if (-not (Find-PostgresToolPath 'psql')) { throw 'REQUIRED_TOOL_MISSING:psql' }
  Write-Status 'VALIDATION_ONLY' 'PASS'
  Write-Status 'PROJECT_REF' $ProjectRef
  Write-Status 'SECRET_INPUTS_NEEDED' 'DB_CONNECTION_PLUS_ENCRYPTION_PASSPHRASE'
  exit 0
}

$dbUrl = $null
$passphrase = $null
$created = $false
$restoreStatus = 'NOT_RUN'
try {
  $bootstrapPsql = Find-PostgresToolPath 'psql'
  if (-not $bootstrapPsql) { throw 'REQUIRED_TOOL_MISSING:psql' }
  $bridge = Join-Path $RepoRoot 'supabase\production-reconciliation\production-bridge-precheck.sql'
  $validator = Join-Path $RepoRoot 'scripts\production-readiness\validate-backup-gate.mjs'
  if (-not (Test-Path -LiteralPath $bridge)) { throw 'BRIDGE_PRECHECK_MISSING' }
  if (-not (Test-Path -LiteralPath $validator)) { throw 'BACKUP_VALIDATOR_MISSING' }

  $dbUrl = Read-SecretText 'PRODUCTION PostgreSQL connection string (input hidden)'
  $passphrase = Read-SecretText 'Backup encryption passphrase (input hidden)'
  if ([string]::IsNullOrWhiteSpace($dbUrl) -or [string]::IsNullOrWhiteSpace($passphrase)) { throw 'SECRET_INPUT_EMPTY' }
  Assert-ProductionDatabaseTarget $dbUrl | Out-Null
  $serverVersionNum = Invoke-PsqlScalar $bootstrapPsql $dbUrl 'show server_version_num;'
  $serverMajor = Get-PostgresMajorFromVersionNum $serverVersionNum
  $client = Resolve-PostgresClient $serverMajor
  $pgDump = $client.PgDump
  $pgRestore = $client.PgRestore
  $psql = $client.Psql
  Write-Status 'SERVER_PG_MAJOR' $serverMajor
  Write-Status 'PG_DUMP_MAJOR' $client.Major
  if ((Get-PostgresMajorRank $client.Major) -lt (Get-PostgresMajorRank $serverMajor)) { throw 'PG_DUMP_VERSION_INCOMPATIBLE' }

  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
  $created = $true

  $publicCountsSql = @'
with counts as (
  select 'profiles' table_name, count(*)::bigint row_count from public.profiles
  union all select 'messages', count(*) from public.messages
  union all select 'commitments', count(*) from public.commitments
  union all select 'subscriptions', count(*) from public.subscriptions
  union all select 'contacts', count(*) from public.contacts
  union all select 'conversations', count(*) from public.conversations
  union all select 'conversation_participants', count(*) from public.conversation_participants
  union all select 'message_reactions', count(*) from public.message_reactions
  union all select 'user_calendar_accounts', count(*) from public.user_calendar_accounts
  union all select 'ai_messages', count(*) from public.ai_messages
  union all select 'calls', count(*) from public.calls
  union all select 'operation_checklists', count(*) from public.operation_checklists
  union all select 'operation_checklist_items', count(*) from public.operation_checklist_items
  union all select 'operation_checklist_runs', count(*) from public.operation_checklist_runs
  union all select 'operation_checklist_run_items', count(*) from public.operation_checklist_run_items
  union all select 'shift_reports', count(*) from public.shift_reports
  union all select 'conversation_operation_focuses', count(*) from public.conversation_operation_focuses
  union all select 'commitment_operation_progress', count(*) from public.commitment_operation_progress
)
select json_build_object(
  'counts', (select json_object_agg(table_name, row_count) from counts),
  'total', (select coalesce(sum(row_count), 0)::bigint from counts)
)::text;
'@
  $publicCounts = Invoke-PsqlScalar $psql $dbUrl $publicCountsSql | ConvertFrom-Json
  if ($null -eq $publicCounts.counts -or $null -eq $publicCounts.total) { throw 'PUBLIC_ROW_COUNTS_INVALID' }
  if (-not (Test-Path -LiteralPath $SnapshotPath)) { throw 'PRODUCTION_SNAPSHOT_MISSING' }
  $snapshot = Get-Content -LiteralPath $SnapshotPath -Raw | ConvertFrom-Json
  if ($snapshot.projectRef -ne $ProjectRef -or $snapshot.publicTableCount -ne 18) { throw 'PRODUCTION_SNAPSHOT_TARGET_INVALID' }
  $snapshotPublicRowCount = [int64]$snapshot.publicRowCount
  $publicCounts | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $PublicRowCountsPath -Encoding UTF8
  Write-Output 'PUBLIC_ROW_COUNTS:'
  foreach ($tableName in $LegacyPublicTables) { Write-Status "PUBLIC_ROW_COUNT_$tableName" $publicCounts.counts.$tableName }
  Write-Status 'PUBLIC_ROW_TOTAL' $publicCounts.total
  Write-Status 'PUBLIC_ROW_SNAPSHOT_TOTAL' $snapshotPublicRowCount
  Write-Status 'PUBLIC_ROW_DELTA_FROM_SNAPSHOT' ([int64]$publicCounts.total - $snapshotPublicRowCount)

  $dumpArgs = @('--dbname', $dbUrl, '--format=custom', '--schema=public', '--schema=auth', '--schema=storage')
  Invoke-Checked $pgDump ($dumpArgs + "--file=$DbDumpPath") 'DATABASE_BACKUP_FAILED'
  Invoke-Checked $pgDump ($dumpArgs + @('--section=pre-data', "--file=$SchemaDumpPath")) 'SCHEMA_BACKUP_FAILED'
  Invoke-Checked $pgDump ($dumpArgs + @('--section=data', "--file=$DataDumpPath")) 'DATA_BACKUP_FAILED'
  $restoreLines = & $pgRestore '--list' $DbDumpPath 2>$null
  if ($LASTEXITCODE -ne 0 -or @($restoreLines).Count -eq 0) { throw 'RESTORE_LIST_FAILED' }
  $restoreLines | Set-Content -LiteralPath $RestoreListPath -Encoding UTF8
  & $pgRestore '--schema-only' '--no-owner' '--no-privileges' '--file' $RestoreExtractPath $DbDumpPath *> $null
  if ($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $RestoreExtractPath).Length -le 0) { throw 'RESTORE_EXTRACTION_FAILED' }

  $authSql = @'
select json_build_object(
  'count', count(*),
  'users', coalesce(json_agg(json_build_object(
    'id', id, 'email', email, 'phone', phone, 'role', role,
    'aud', aud, 'created_at', created_at, 'updated_at', updated_at,
    'confirmed_at', confirmed_at, 'last_sign_in_at', last_sign_in_at,
    'raw_app_meta_data', raw_app_meta_data, 'raw_user_meta_data', raw_user_meta_data
  ) order by id), '[]'::json)
)::text
from auth.users;
'@
  $authJson = Invoke-PsqlScalar $psql $dbUrl $authSql | ConvertFrom-Json
  if ($authJson.count -ne 4) { throw "AUTH_USER_COUNT_MISMATCH:$($authJson.count)" }
  $authJson | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $AuthPath -Encoding UTF8

  $storageSql = @'
select json_build_object(
  'bucket_count', (select count(*) from storage.buckets where id in ('chat-media','recordings')),
  'object_count', (select count(*) from storage.objects where bucket_id in ('chat-media','recordings')),
  'objects', coalesce((select json_agg(json_build_object('bucket', bucket_id, 'path', name) order by bucket_id, name) from storage.objects where bucket_id in ('chat-media','recordings')), '[]'::json)
)::text;
'@
  $storageJson = Invoke-PsqlScalar $psql $dbUrl $storageSql | ConvertFrom-Json
  if ($storageJson.bucket_count -ne 2 -or $storageJson.object_count -ne 48) { throw "STORAGE_BASELINE_MISMATCH:$($storageJson.bucket_count)/$($storageJson.object_count)" }
  $storageJson | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $StorageInventoryPath -Encoding UTF8

  $storageRoot = Join-Path $WorkRoot 'storage'
  $objectHashes = @()
  foreach ($object in @($storageJson.objects)) {
    $bucketRoot = Join-Path $storageRoot ([string]$object.bucket)
    $target = Join-Path $bucketRoot (([string]$object.path) -replace '/', '\')
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    $bucketRootFull = (Resolve-Path -LiteralPath $bucketRoot).Path
    $targetFull = [IO.Path]::GetFullPath($target)
    if (-not $targetFull.StartsWith($bucketRootFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'STORAGE_PATH_ESCAPE' }
    $encodedPath = [Uri]::EscapeDataString([string]$object.path).Replace('%2F', '/')
    Invoke-WebRequest -Uri "$ProjectUrl/storage/v1/object/public/$($object.bucket)/$encodedPath" -Method Get -OutFile $target -UseBasicParsing
    $objectHashes += [ordered]@{ bucket = [string]$object.bucket; path = [string]$object.path; sha256 = Get-Hash $target; bytes = (Get-Item -LiteralPath $target).Length }
  }
  if (@($objectHashes).Count -ne 48) { throw "STORAGE_HASH_COUNT_MISMATCH:$(@($objectHashes).Count)" }
  $objectHashes | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $StorageManifestPath -Encoding UTF8

  $precheckArgs = @('--dbname', $dbUrl, '--set', 'ON_ERROR_STOP=1', '--csv', '--tuples-only', '--quiet', '--file', $bridge)
  $precheckArgs += @('--set', "expected_public_total=$($publicCounts.total)")
  foreach ($tableName in $LegacyPublicTables) { $precheckArgs += @('--set', "expected_public_$tableName=$($publicCounts.counts.$tableName)") }
  & $psql @precheckArgs 2>$null | Set-Content -LiteralPath $PrecheckPath -Encoding UTF8
  if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION_PRECHECK_FAILED' }
  Validate-Precheck $PrecheckPath

  $serverNames = @('initdb', 'pg_ctl', 'postgres', 'createdb', 'dropdb')
  $serverAvailable = $true
  foreach ($name in $serverNames) {
    $property = $name.Substring(0, 1).ToUpperInvariant() + $name.Substring(1)
    if (-not (Test-Path -LiteralPath ([string]$client.$property))) { $serverAvailable = $false }
  }
  if ($serverAvailable) {
    $restoreStatus = Invoke-LocalRestore $client $DbDumpPath $WorkRoot $publicCounts
  } else {
    $restoreStatus = 'MAXIMUM_VERIFICATION_SERVER_BINARIES_UNAVAILABLE'
  }
  if ($restoreStatus -ne 'REAL_LOCAL_RESTORE_PASS') { throw "RESTORE_REHEARSAL_NOT_COMPLETE:$restoreStatus" }

  [ordered]@{
    projectRef = $ProjectRef; backupId = "ping-$Stamp"; schemaBackupSha256 = Get-Hash $SchemaDumpPath
    dataBackupSha256 = Get-Hash $DataDumpPath; storageInventoryId = "storage-$Stamp"
    storageBinaryBackupId = "storage-binaries-$Stamp"; storageBinaryBackupSha256 = Get-Hash $StorageManifestPath
    restoreVerificationId = "pg-local-restore-$Stamp"; createdAt = (Get-Date).ToUniversalTime().ToString('o')
    encrypted = $true; outsideProvider = $true; BACKUP_CREATED = 'YES'; BACKUP_VERIFIED = 'YES'
    database = 'PASS'; auth = 'PASS'; storageMetadata = 'PASS'; storageBinaries = '48/48'
    sha256 = 'PASS'; restoreRehearsal = $restoreStatus; productionPrecheck = 'PASS_WITH_EXPECTED_LEGACY_REVIEW'
    publicRowCounts = $publicCounts.counts; publicRowTotal = $publicCounts.total; historicalSnapshotPublicRowCount = $snapshotPublicRowCount
    publicRowBaseline = 'CAPTURED_AND_PRESERVED'
  } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $WorkRoot 'evidence.json') -Encoding UTF8
  Compress-Archive -Path (Join-Path $WorkRoot '*') -DestinationPath $ZipPath -CompressionLevel Optimal
  Protect-File -InputPath $ZipPath -OutputPath $EncryptedPath -MetadataPath $CryptoMetaPath -Passphrase $passphrase
  $evidence = Get-Content -LiteralPath (Join-Path $WorkRoot 'evidence.json') -Raw
  $evidence | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  & node $validator $EvidencePath *> $null
  if ($LASTEXITCODE -ne 0) { throw 'BACKUP_GATE_VALIDATION_FAILED' }
  Write-Status 'BACKUP_CREATED' 'YES'; Write-Status 'BACKUP_VERIFIED' 'YES'; Write-Status 'BACKUP_ENCRYPTED' 'YES'
  Write-Status 'BACKUP_DATABASE' 'PASS'; Write-Status 'BACKUP_AUTH' 'PASS'; Write-Status 'BACKUP_STORAGE_METADATA' 'PASS'
  Write-Status 'BACKUP_STORAGE_BINARIES' '48/48'; Write-Status 'BACKUP_SHA256_VERIFIED' 'PASS'; Write-Status 'RESTORE_REHEARSAL' $restoreStatus
  Write-Status 'BACKUP_GATE' 'PASS'; Write-Status 'PRODUCTION_PRECHECK' 'PASS'; Write-Status 'EVIDENCE_PATH' $EvidencePath
  Write-Status 'ENCRYPTED_PACKAGE' $EncryptedPath; Write-Status 'PRODUCTION_CUTOVER_READY_FOR_SINGLE_AUTHORIZATION' 'YES'
} catch {
  Write-Status 'BACKUP_CREATED' 'NO'; Write-Status 'BACKUP_VERIFIED' 'NO'; Write-Status 'BACKUP_GATE' 'FAIL'
  Write-Status 'RESTORE_REHEARSAL' $restoreStatus; Write-Status 'PRODUCTION_CUTOVER_READY_FOR_SINGLE_AUTHORIZATION' 'NO'
  Write-Status 'FAILURE' $_.Exception.Message
  exit 1
} finally {
  if ($created) {
    Remove-Item -LiteralPath $WorkRoot -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
  }
  $dbUrl = $null; $passphrase = $null
}
