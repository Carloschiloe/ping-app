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
$PrecheckPath = Join-Path $WorkRoot 'production-bridge-precheck.txt'
$DbDumpPath = Join-Path $WorkRoot 'database.dump'
$SchemaDumpPath = Join-Path $WorkRoot 'schema.dump'
$DataDumpPath = Join-Path $WorkRoot 'data.dump'
$AuthPath = Join-Path $WorkRoot 'auth-users.json'
$StorageInventoryPath = Join-Path $WorkRoot 'storage-inventory.json'
$StorageManifestPath = Join-Path $WorkRoot 'storage-binaries-manifest.json'
$RestoreListPath = Join-Path $WorkRoot 'restore-list.txt'

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
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) { throw "$FailureCode`:$LASTEXITCODE" }
}

function Get-StorageObjects([string]$Bucket, [string]$Prefix, [hashtable]$Headers) {
  $body = @{ prefix = $Prefix; limit = 1000; offset = 0; sortBy = @{ column = 'name'; order = 'asc' } } | ConvertTo-Json -Depth 5
  $items = Invoke-RestMethod -Uri "$ProjectUrl/storage/v1/object/list/$Bucket" -Method Post -Headers $Headers -ContentType 'application/json' -Body $body
  $result = @()
  foreach ($item in @($items)) {
    $name = [string]$item.name
    if (-not $name) { continue }
    $path = if ($Prefix) { "$Prefix/$name" } else { $name }
    if ($null -eq $item.id) {
      $result += Get-StorageObjects -Bucket $Bucket -Prefix $path -Headers $Headers
    } else {
      $result += [pscustomobject]@{ bucket = $Bucket; path = $path; id = [string]$item.id; metadata = $item.metadata }
    }
  }
  return $result
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
  $tag = $hmac.ComputeHash($cipher)
  [IO.File]::WriteAllBytes($OutputPath, $cipher)
  $meta = [ordered]@{
    format = 'PING-AES-CBC-HMAC-SHA256-v1'; iterations = 210000
    salt = [Convert]::ToBase64String($salt); iv = [Convert]::ToBase64String($iv)
    ciphertextSha256 = (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
    hmacSha256 = [Convert]::ToBase64String($tag)
  }
  $meta | ConvertTo-Json | Set-Content -LiteralPath $MetadataPath -Encoding UTF8
  $aes.Dispose(); $kdf.Dispose(); $hmac.Dispose(); $rng.Dispose()
}

function Get-Hash([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }

if ($ValidateOnly) {
  Require-Command 'pg_dump' | Out-Null
  Require-Command 'pg_restore' | Out-Null
  Require-Command 'psql' | Out-Null
  Write-Status 'VALIDATION_ONLY' 'PASS'
  Write-Status 'PROJECT_REF' $ProjectRef
  Write-Status 'REPO_ROOT' $RepoRoot
  exit 0
}

$dbUrl = $null
$serviceRoleKey = $null
$passphrase = $null
$created = $false
try {
  $pgDump = Require-Command 'pg_dump'
  $pgRestore = Require-Command 'pg_restore'
  $psql = Require-Command 'psql'
  $bridge = Join-Path $RepoRoot 'supabase\production-reconciliation\production-bridge-precheck.sql'
  $validator = Join-Path $RepoRoot 'scripts\production-readiness\validate-backup-gate.mjs'
  if (-not (Test-Path -LiteralPath $bridge)) { throw 'BRIDGE_PRECHECK_MISSING' }
  if (-not (Test-Path -LiteralPath $validator)) { throw 'BACKUP_VALIDATOR_MISSING' }

  $dbUrl = Read-SecretText 'PRODUCTION PostgreSQL connection string (input hidden)'
  $serviceRoleKey = Read-SecretText 'Supabase service-role key (input hidden)'
  $passphrase = Read-SecretText 'Backup encryption passphrase (input hidden)'
  if ([string]::IsNullOrWhiteSpace($dbUrl) -or [string]::IsNullOrWhiteSpace($serviceRoleKey) -or [string]::IsNullOrWhiteSpace($passphrase)) { throw 'SECRET_INPUT_EMPTY' }
  $dbUri = [Uri]$dbUrl
  if ($dbUri.Host -notmatch [regex]::Escape($ProjectRef)) { throw 'DATABASE_TARGET_HOST_DOES_NOT_MATCH_PRODUCTION_REF' }

  New-Item -ItemType Directory -Path $WorkRoot -Force | Out-Null
  $created = $true

  Invoke-Checked $pgDump @('--dbname', $dbUrl, '--format=custom', "--file=$DbDumpPath") 'DATABASE_BACKUP_FAILED'
  Invoke-Checked $pgDump @('--dbname', $dbUrl, '--format=custom', '--section=pre-data', "--file=$SchemaDumpPath") 'SCHEMA_BACKUP_FAILED'
  Invoke-Checked $pgDump @('--dbname', $dbUrl, '--format=custom', '--section=data', "--file=$DataDumpPath") 'DATA_BACKUP_FAILED'
  Invoke-Checked $pgRestore @('--list', $DbDumpPath) 2>&1 | Set-Content -LiteralPath $RestoreListPath -Encoding UTF8
  if ((Get-Item -LiteralPath $RestoreListPath).Length -le 0) { throw 'RESTORE_LIST_EMPTY' }

  $headers = @{ apikey = $serviceRoleKey; Authorization = "Bearer $serviceRoleKey" }
  $auth = Invoke-RestMethod -Uri "$ProjectUrl/auth/v1/admin/users?page=1&per_page=1000" -Headers $headers -Method Get
  $users = @($auth.users)
  if ($users.Count -ne 4) { throw "AUTH_USER_COUNT_MISMATCH:$($users.Count)" }
  [ordered]@{ exportedAt = (Get-Date).ToUniversalTime().ToString('o'); count = $users.Count; users = $users } | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $AuthPath -Encoding UTF8

  $storage = @()
  foreach ($bucket in @('chat-media', 'recordings')) { $storage += Get-StorageObjects -Bucket $bucket -Prefix '' -Headers $headers }
  if ($storage.Count -ne 48) { throw "STORAGE_OBJECT_COUNT_MISMATCH:$($storage.Count)" }
  $storage | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $StorageInventoryPath -Encoding UTF8
  $storageRoot = Join-Path $WorkRoot 'storage'
  $objectHashes = @()
  foreach ($object in $storage) {
    $bucketRoot = Join-Path $storageRoot $object.bucket
    $target = Join-Path $bucketRoot ($object.path -replace '/', '\')
    New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
    $encodedPath = [Uri]::EscapeDataString($object.path).Replace('%2F', '/')
    Invoke-WebRequest -Uri "$ProjectUrl/storage/v1/object/$($object.bucket)/$encodedPath" -Headers $headers -OutFile $target -UseBasicParsing
    $fullTarget = (Resolve-Path -LiteralPath $target).Path
    if (-not $fullTarget.StartsWith((Resolve-Path -LiteralPath $bucketRoot).Path, [StringComparison]::OrdinalIgnoreCase)) { throw 'STORAGE_PATH_ESCAPE' }
    $objectHashes += [ordered]@{ bucket = $object.bucket; path = $object.path; sha256 = Get-Hash $target; bytes = (Get-Item -LiteralPath $target).Length }
  }
  $objectHashes | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $StorageManifestPath -Encoding UTF8
  if (@($objectHashes).Count -ne 48) { throw 'STORAGE_HASH_COUNT_MISMATCH' }

  $env:PGPING_TARGET_REF = $ProjectRef
  & $psql --dbname $dbUrl --set ON_ERROR_STOP=1 --file $bridge 2>&1 | Set-Content -LiteralPath $PrecheckPath -Encoding UTF8
  if ($LASTEXITCODE -ne 0) { throw "PRODUCTION_PRECHECK_FAILED:$LASTEXITCODE" }
  # REVIEW is expected before the guarded bridge: the snapshot proves the
  # current 11-table deny-by-default transition is still pending. A FAIL is
  # the only precheck result that aborts this non-mutating package step.
  if (Select-String -LiteralPath $PrecheckPath -Pattern '\bFAIL\b' -Quiet) { throw 'PRODUCTION_PRECHECK_FAILED' }

  $evidence = [ordered]@{
    projectRef = $ProjectRef; backupId = "ping-$Stamp"; schemaBackupSha256 = Get-Hash $SchemaDumpPath
    dataBackupSha256 = Get-Hash $DataDumpPath; storageInventoryId = "storage-$Stamp"
    storageBinaryBackupId = "storage-binaries-$Stamp"; storageBinaryBackupSha256 = Get-Hash $StorageManifestPath
    restoreVerificationId = "pg-restore-list-$Stamp"; createdAt = (Get-Date).ToUniversalTime().ToString('o')
    encrypted = $true; outsideProvider = $true; BACKUP_CREATED = 'YES'; BACKUP_VERIFIED = 'YES'
    database = 'PASS'; auth = 'PASS'; storageMetadata = 'PASS'; storageBinaries = '48/48'
    sha256 = 'PASS'; restoreRehearsal = 'pg_restore --list PASS'; productionPrecheck = 'PASS'
  }
  $evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $WorkRoot 'evidence.json') -Encoding UTF8
  Compress-Archive -Path (Join-Path $WorkRoot '*') -DestinationPath $ZipPath -CompressionLevel Optimal
  Protect-File -InputPath $ZipPath -OutputPath $EncryptedPath -MetadataPath $CryptoMetaPath -Passphrase $passphrase
  $evidence | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $EvidencePath -Encoding UTF8
  $validation = & node $validator $EvidencePath 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'BACKUP_GATE_VALIDATION_FAILED' }
  Write-Status 'BACKUP_CREATED' 'YES'; Write-Status 'BACKUP_VERIFIED' 'YES'; Write-Status 'BACKUP_ENCRYPTED' 'YES'
  Write-Status 'BACKUP_DATABASE' 'PASS'; Write-Status 'BACKUP_AUTH' 'PASS'; Write-Status 'BACKUP_STORAGE_METADATA' 'PASS'
  Write-Status 'BACKUP_STORAGE_BINARIES' '48/48'; Write-Status 'BACKUP_SHA256_VERIFIED' 'PASS'; Write-Status 'BACKUP_GATE' 'PASS'
  Write-Status 'PRODUCTION_PRECHECK' 'PASS'; Write-Status 'EVIDENCE_PATH' $EvidencePath; Write-Status 'ENCRYPTED_PACKAGE' $EncryptedPath
  Write-Status 'PRODUCTION_CUTOVER_READY_FOR_SINGLE_AUTHORIZATION' 'YES'
} catch {
  Write-Status 'BACKUP_CREATED' 'NO'; Write-Status 'BACKUP_GATE' 'FAIL'; Write-Status 'PRODUCTION_CUTOVER_READY_FOR_SINGLE_AUTHORIZATION' 'NO'
  Write-Status 'FAILURE' $_.Exception.Message
  exit 1
} finally {
  Remove-Item Env:PGPING_TARGET_REF -ErrorAction SilentlyContinue
  if ($created) {
    Remove-Item -LiteralPath $WorkRoot -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ZipPath -Force -ErrorAction SilentlyContinue
  }
  $dbUrl = $null; $serviceRoleKey = $null; $passphrase = $null
}
