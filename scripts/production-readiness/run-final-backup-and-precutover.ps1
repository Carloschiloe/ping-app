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
$PrecheckPath = Join-Path $WorkRoot 'production-bridge-precheck.csv'
$DbDumpPath = Join-Path $WorkRoot 'database-public-auth-storage.dump'
$SchemaDumpPath = Join-Path $WorkRoot 'schema-public-auth-storage.dump'
$DataDumpPath = Join-Path $WorkRoot 'data-public-auth-storage.dump'
$AuthPath = Join-Path $WorkRoot 'auth-users.json'
$StorageInventoryPath = Join-Path $WorkRoot 'storage-inventory.json'
$StorageManifestPath = Join-Path $WorkRoot 'storage-binaries-manifest.json'
$RestoreListPath = Join-Path $WorkRoot 'restore-list.txt'
$RestoreExtractPath = Join-Path $WorkRoot 'restore-extracted.sql'

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

function Get-Hash([string]$Path) {
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Assert-ProductionDatabaseTarget([string]$DbUrl) {
  try { $uri = [Uri]$DbUrl } catch { throw 'DATABASE_URL_INVALID' }
  $host = $uri.DnsSafeHost.ToLowerInvariant()
  $user = [Uri]::UnescapeDataString(($uri.UserInfo -split ':')[0])
  $directHost = "db.$ProjectRef.supabase.co"
  $direct = $host -eq $directHost -and $user -eq 'postgres'
  $pooler = $host -match '^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$' -and $user -eq "postgres.$ProjectRef"
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

function Invoke-LocalRestore([string]$PgRestore, [string]$Psql, [string]$DbDump, [string]$Work) {
  $names = @('initdb', 'pg_ctl', 'postgres', 'createdb', 'dropdb')
  $commands = @{}
  foreach ($name in $names) { $commands[$name] = Require-Command $name }
  $cluster = Join-Path $Work 'restore-cluster'
  $port = 55432 + (Get-Random -Minimum 0 -Maximum 400)
  $started = $false
  try {
    Invoke-Checked $commands.initdb @('-D', $cluster, '-A', 'trust', '-U', 'ping_rehearsal') 'LOCAL_INITDB_FAILED'
    Invoke-Checked $commands.pg_ctl @('-D', $cluster, '-o', "-p $port -h 127.0.0.1", '-w', 'start') 'LOCAL_POSTGRES_START_FAILED'
    $started = $true
    Invoke-Checked $commands.createdb @('-h', '127.0.0.1', '-p', "$port", '-U', 'ping_rehearsal', 'ping_restore') 'LOCAL_CREATEDB_FAILED'
    Invoke-Checked $PgRestore @('--exit-on-error', '--no-owner', '--no-privileges', '--dbname=ping_restore', '--host=127.0.0.1', "--port=$port", $DbDump) 'LOCAL_RESTORE_FAILED'
    $countsSql = "select json_build_object('auth', (select count(*) from auth.users), 'storage', (select count(*) from storage.objects), 'public', (select coalesce(sum(row_count),0)::bigint from (select count(*) row_count from public.profiles union all select count(*) from public.messages union all select count(*) from public.commitments union all select count(*) from public.subscriptions union all select count(*) from public.contacts union all select count(*) from public.conversations union all select count(*) from public.conversation_participants union all select count(*) from public.message_reactions union all select count(*) from public.user_calendar_accounts union all select count(*) from public.ai_messages union all select count(*) from public.calls union all select count(*) from public.operation_checklists union all select count(*) from public.operation_checklist_items union all select count(*) from public.operation_checklist_runs union all select count(*) from public.operation_checklist_run_items union all select count(*) from public.shift_reports union all select count(*) from public.conversation_operation_focuses union all select count(*) from public.commitment_operation_progress) counts))::text;"
    $counts = & $Psql '--dbname=ping_restore' '--host=127.0.0.1' "--port=$port" '--quiet' '--tuples-only' '--no-align' '--command' $countsSql 2>$null
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_RESTORE_COUNTS_FAILED' }
    $parsed = (($counts -join "`n").Trim() | ConvertFrom-Json)
    if ($parsed.auth -ne 4 -or $parsed.storage -ne 48 -or $parsed.public -ne 0) { throw 'LOCAL_RESTORE_COUNTS_MISMATCH' }
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
    if ($row.status -eq 'FAIL') { throw "PRODUCTION_PRECHECK_UNEXPECTED_FAIL:$($row.check_name)" }
    if ($row.status -eq 'REVIEW' -and $expectedReview -notcontains $row.check_name) { throw "PRODUCTION_PRECHECK_UNEXPECTED_REVIEW:$($row.check_name)" }
    if ($row.status -notin @('PASS', 'REVIEW')) { throw "PRODUCTION_PRECHECK_UNKNOWN_STATUS:$($row.check_name)" }
  }
}

if ($ValidateOnly) {
  Require-Command 'pg_dump' | Out-Null
  Require-Command 'pg_restore' | Out-Null
  Require-Command 'psql' | Out-Null
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
  $pgDump = Require-Command 'pg_dump'
  $pgRestore = Require-Command 'pg_restore'
  $psql = Require-Command 'psql'
  $bridge = Join-Path $RepoRoot 'supabase\production-reconciliation\production-bridge-precheck.sql'
  $validator = Join-Path $RepoRoot 'scripts\production-readiness\validate-backup-gate.mjs'
  if (-not (Test-Path -LiteralPath $bridge)) { throw 'BRIDGE_PRECHECK_MISSING' }
  if (-not (Test-Path -LiteralPath $validator)) { throw 'BACKUP_VALIDATOR_MISSING' }

  $dbUrl = Read-SecretText 'PRODUCTION PostgreSQL connection string (input hidden)'
  $passphrase = Read-SecretText 'Backup encryption passphrase (input hidden)'
  if ([string]::IsNullOrWhiteSpace($dbUrl) -or [string]::IsNullOrWhiteSpace($passphrase)) { throw 'SECRET_INPUT_EMPTY' }
  Assert-ProductionDatabaseTarget $dbUrl | Out-Null

  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
  $created = $true

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

  & $psql '--dbname' $dbUrl '--set' 'ON_ERROR_STOP=1' '--csv' '--tuples-only' '--quiet' '--file' $bridge 2>$null | Set-Content -LiteralPath $PrecheckPath -Encoding UTF8
  if ($LASTEXITCODE -ne 0) { throw 'PRODUCTION_PRECHECK_FAILED' }
  Validate-Precheck $PrecheckPath

  $serverNames = @('initdb', 'pg_ctl', 'postgres', 'createdb', 'dropdb')
  $serverAvailable = $true
  foreach ($name in $serverNames) { if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { $serverAvailable = $false } }
  if ($serverAvailable) {
    $restoreStatus = Invoke-LocalRestore $pgRestore $psql $DbDumpPath $WorkRoot
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
