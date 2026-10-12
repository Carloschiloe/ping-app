$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'run-final-backup-and-precutover.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath), [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw "PowerShell parse errors: $($errors.Count)" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -ValidateOnly
if ($LASTEXITCODE -ne 0) { throw 'orchestrator validation failed' }

$projectRef = 'wbigqhtuzfmpnxservlf'
$functionNames = @('Get-SafeStageDetail', 'ConvertTo-WindowsProcessArgument', 'Stop-ProcessTree', 'Invoke-ExternalProcess', 'Stop-ActiveExternalProcesses', 'Wait-LocalPostgresReady', 'Get-PostgresMajorRank', 'Get-PostgresSearchRoots', 'Select-PostgresClientCandidate', 'Get-PostgresServerCommandMap', 'Test-PostgresServerCommandMap', 'Assert-PublicRowCounts')
foreach ($functionName in $functionNames) {
  $functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName }, $true)
  if (-not $functionAst) { throw "missing function: $functionName" }
  Invoke-Expression $functionAst.Extent.Text
}
$script:RunStopwatch = [Diagnostics.Stopwatch]::StartNew()
$script:ChildProcesses = [System.Collections.ArrayList]::new()
$script:CurrentStage = 'TEST'
$source = Get-Content -LiteralPath $scriptPath -Raw
$requiredStages = @(
  'CAPTURE_BASELINE', 'DATABASE_FULL_DUMP', 'DATABASE_SCHEMA_DUMP', 'DATABASE_DATA_DUMP',
  'RESTORE_LIST', 'RESTORE_EXTRACT', 'AUTH_EXPORT', 'STORAGE_METADATA', 'STORAGE_BINARY_DOWNLOAD',
  'PRODUCTION_PRECHECK', 'LOCAL_RESTORE_INIT', 'LOCAL_RESTORE_START', 'LOCAL_RESTORE_DATABASE_CREATE',
  'LOCAL_RESTORE_APPLY', 'LOCAL_RESTORE_VERIFY_COUNTS', 'BACKUP_COMPRESS', 'BACKUP_ENCRYPT',
  'BACKUP_VALIDATE', 'FINALIZE'
)
foreach ($stageName in $requiredStages) {
  if ($source -notmatch [regex]::Escape("Invoke-Stage '$stageName'")) { throw "stage marker missing: $stageName" }
}
if ($source -notmatch 'STORAGE_PROGRESS=\$index/\$totalObjects') { throw 'storage progress marker missing' }
if ($source -notmatch 'TimeoutSec 120') { throw 'storage timeout missing' }
if ($source -notmatch 'TIMEOUT:STORAGE_BINARY_DOWNLOAD:\$index') { throw 'storage timeout classification missing' }
if ($source -notmatch [regex]::Escape("'-l', `$postgresLog")) { throw 'postgres logfile argument missing' }
if ($source -notmatch 'LOCAL_RESTORE_START.*\$false') { throw 'postgres start output capture is not disabled' }
if ($source -notmatch 'TIMEOUT:\{0\}:OUTPUT_DRAIN') { throw 'output drain timeout classification missing' }
if ($source -notmatch 'Stop-ActiveExternalProcesses' -or $source -notmatch 'Stop-LocalPostgres') { throw 'failure cleanup hooks missing' }
$restoreSection = [regex]::Match($source, '(?s)function Invoke-LocalRestore.*?function Validate-Precheck').Value
if ($source -notmatch "'--username=ping_rehearsal', '--dbname=postgres'") { throw 'readiness username missing' }
if ($restoreSection -notmatch "'-U', 'ping_rehearsal', 'ping_restore'") { throw 'createdb username missing' }
if ($restoreSection -notmatch "'--username=ping_rehearsal', '--exit-on-error'") { throw 'pg_restore username missing' }
if ($restoreSection -notmatch "'--username=ping_rehearsal', '--dbname=ping_restore'") { throw 'verify-counts username missing' }
if ($restoreSection -notmatch 'postgres\.log') { throw 'local restore logfile missing' }
if ($restoreSection -match '\$env:USERNAME|GetEnvironmentVariable\([^)]*USERNAME') { throw 'local restore depends on Windows username' }
if ($source -notmatch 'TIMEOUT:LOCAL_RESTORE_START:READINESS:last_error=') { throw 'readiness last-error diagnostic missing' }
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
try {
  Invoke-ExternalProcess $powershell @('-NoProfile', '-Command', 'Start-Sleep -Seconds 5') 1 'TEST_PROCESS_TIMEOUT' | Out-Null
  throw 'external process timeout was not enforced'
} catch {
  if ($_.Exception.Message -notmatch 'TIMEOUT:TEST_PROCESS_TIMEOUT') { throw }
}
if ($script:ChildProcesses.Count -ne 0) { throw 'timed out process was not removed from cleanup registry' }
$pipeHolder = Join-Path ([IO.Path]::GetTempPath()) ("ping-pipe-holder-" + [guid]::NewGuid().ToString('N') + '.ps1')
@'
$childInfo = [Diagnostics.ProcessStartInfo]::new()
$childInfo.FileName = (Get-Command powershell.exe).Source
$childInfo.UseShellExecute = $false
$childInfo.CreateNoWindow = $true
$childInfo.Arguments = '-NoProfile -Command "Start-Sleep -Seconds 5"'
[void][Diagnostics.Process]::Start($childInfo)
exit 0
'@ | Set-Content -LiteralPath $pipeHolder -Encoding UTF8
try {
  try {
    Invoke-ExternalProcess $powershell @('-NoProfile', '-File', $pipeHolder) 2 'TEST_OUTPUT_DRAIN' | Out-Null
    throw 'inherited output pipe did not trigger timeout'
  } catch {
    if ($_.Exception.Message -notmatch 'TIMEOUT:TEST_OUTPUT_DRAIN:OUTPUT_DRAIN') { throw }
  }
} finally {
  Remove-Item -LiteralPath $pipeHolder -Force -ErrorAction SilentlyContinue
  Stop-ActiveExternalProcesses
}
if ($script:ChildProcesses.Count -ne 0) { throw 'output-drain process was not removed from cleanup registry' }
try {
  Wait-LocalPostgresReady $powershell 59999 1
  throw 'readiness failure did not time out'
} catch {
  if ($_.Exception.Message -notmatch 'TIMEOUT:LOCAL_RESTORE_START:READINESS:last_error=') { throw }
}
Write-Output 'STAGE_MARKER_TESTS=PASS'
Write-Output 'PROCESS_TIMEOUT_TESTS=PASS'
Write-Output 'OUTPUT_DRAIN_TIMEOUT_TESTS=PASS'
Write-Output 'STORAGE_TIMEOUT_TESTS=PASS'
Write-Output 'FAILURE_CLEANUP_TESTS=PASS'
Write-Output 'LOCAL_RESTORE_USERNAME_TESTS=PASS'
Write-Output 'LOCAL_RESTORE_READINESS_TESTS=PASS'
$server17Candidates = @(
  [pscustomobject]@{ Major = '16'; BinDir = 'C:\Program Files\PostgreSQL\16\bin' },
  [pscustomobject]@{ Major = '17'; BinDir = 'C:\Program Files\PostgreSQL\17\bin' },
  [pscustomobject]@{ Major = '18'; BinDir = 'C:\Program Files\PostgreSQL\18\bin' }
)
if ((Select-PostgresClientCandidate $server17Candidates '17').Major -ne '17') { throw 'same-major candidate was not preferred' }
if ((Select-PostgresClientCandidate @($server17Candidates[0]) '17') -ne $null) { throw 'lower-major candidate was accepted' }
if ((Select-PostgresClientCandidate @($server17Candidates[2]) '17').Major -ne '18') { throw 'higher-major candidate was rejected' }
$expectedRoots = @(
  (Join-Path ${env:ProgramFiles} 'PostgreSQL'),
  (Join-Path ${env:ProgramFiles(x86)} 'PostgreSQL')
)
if (@(Get-PostgresSearchRoots).Count -ne 2 -or (@(Get-PostgresSearchRoots) -notcontains $expectedRoots[0]) -or (@(Get-PostgresSearchRoots) -notcontains $expectedRoots[1])) { throw 'PostgreSQL Program Files search roots are incomplete' }
$mappingRoot = Join-Path ([IO.Path]::GetTempPath()) ("ping-pg-command-map-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $mappingRoot -Force | Out-Null
try {
  $mappingClient = [pscustomobject]@{
    Initdb = Join-Path $mappingRoot 'initdb.exe'
    PgCtl = Join-Path $mappingRoot 'pg_ctl.exe'
    Postgres = Join-Path $mappingRoot 'postgres.exe'
    Createdb = Join-Path $mappingRoot 'createdb.exe'
    Dropdb = Join-Path $mappingRoot 'dropdb.exe'
  }
  foreach ($path in @($mappingClient.Initdb, $mappingClient.PgCtl, $mappingClient.Postgres, $mappingClient.Createdb, $mappingClient.Dropdb)) { New-Item -ItemType File -Path $path -Force | Out-Null }
  $mappedCommands = Get-PostgresServerCommandMap $mappingClient
  foreach ($pair in @{
    initdb = 'Initdb'; pg_ctl = 'PgCtl'; postgres = 'Postgres'; createdb = 'Createdb'; dropdb = 'Dropdb'
  }.GetEnumerator()) {
    if ($mappedCommands[$pair.Key] -ne $mappingClient.($pair.Value)) { throw "property mapping failed: $($pair.Key)" }
  }
  if (-not (Test-PostgresServerCommandMap $mappedCommands)) { throw 'serverAvailable should be true when all five files exist' }
} finally {
  Remove-Item -LiteralPath $mappingRoot -Recurse -Force -ErrorAction SilentlyContinue
}
$LegacyPublicTables = @(
  'profiles', 'messages', 'commitments', 'subscriptions', 'contacts', 'conversations',
  'conversation_participants', 'message_reactions', 'user_calendar_accounts', 'ai_messages',
  'calls', 'operation_checklists', 'operation_checklist_items', 'operation_checklist_runs',
  'operation_checklist_run_items', 'shift_reports', 'conversation_operation_focuses',
  'commitment_operation_progress'
)
$zeroCounts = [ordered]@{}
$positiveCounts = [ordered]@{}
foreach ($tableName in $LegacyPublicTables) { $zeroCounts[$tableName] = 0; $positiveCounts[$tableName] = if ($tableName -eq 'profiles') { 4 } else { 0 } }
Assert-PublicRowCounts ([pscustomobject]@{ counts = [pscustomobject]$zeroCounts; total = 0 }) ([pscustomobject]@{ counts = [pscustomobject]$zeroCounts; total = 0 })
Assert-PublicRowCounts ([pscustomobject]@{ counts = [pscustomobject]$positiveCounts; total = 4 }) ([pscustomobject]@{ counts = [pscustomobject]$positiveCounts; total = 4 })
try { Assert-PublicRowCounts ([pscustomobject]@{ counts = [pscustomobject]$zeroCounts; total = 0 }) ([pscustomobject]@{ counts = [pscustomobject]$positiveCounts; total = 4 }); throw 'positive baseline mismatch was accepted' } catch { if ($_.Exception.Message -notmatch 'PUBLIC_ROW_COUNT_MISMATCH|PUBLIC_ROW_TOTAL_MISMATCH') { throw } }
Write-Output 'POSTGRES_VERSION_SELECTION_TESTS=PASS'
Write-Output 'PUBLIC_ROW_BASELINE_TESTS=PASS'
Write-Output 'FINAL_BACKUP_ORCHESTRATOR_OFFLINE=PASS'
