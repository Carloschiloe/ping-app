$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'run-final-backup-and-precutover.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath), [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw "PowerShell parse errors: $($errors.Count)" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -ValidateOnly
if ($LASTEXITCODE -ne 0) { throw 'orchestrator validation failed' }

$projectRef = 'wbigqhtuzfmpnxservlf'
$functionNames = @('Get-SafeStageDetail', 'ConvertTo-WindowsProcessArgument', 'Stop-ProcessTree', 'Invoke-ExternalProcess', 'Stop-ActiveExternalProcesses', 'Find-SupabaseCli', 'Invoke-ApplicationDump', 'Assert-ApplicationDumpPortable', 'Get-PortableApplicationSchemaPath', 'Invoke-SupabaseLocalStackRehearsal', 'Get-PostgresMajorRank', 'Get-PostgresSearchRoots', 'Select-PostgresClientCandidate', 'Assert-PublicRowCounts')
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
  'DATABASE_ROLES_DUMP', 'RESTORE_LIST', 'RESTORE_EXTRACT', 'AUTH_EXPORT', 'AUTH_RECOVERY_EXPORT',
  'STORAGE_METADATA', 'STORAGE_BINARY_DOWNLOAD', 'PRODUCTION_PRECHECK', 'APP_RESTORE_REHEARSAL',
  'BACKUP_COMPRESS', 'BACKUP_ENCRYPT',
  'BACKUP_VALIDATE', 'FINALIZE'
)
foreach ($stageName in $requiredStages) {
  if ($source -notmatch [regex]::Escape("Invoke-Stage '$stageName'")) { throw "stage marker missing: $stageName" }
}
if ($source -notmatch 'STORAGE_PROGRESS=\$index/\$totalObjects') { throw 'storage progress marker missing' }
if ($source -notmatch 'TimeoutSec 120') { throw 'storage timeout missing' }
if ($source -notmatch 'TIMEOUT:STORAGE_BINARY_DOWNLOAD:\$index') { throw 'storage timeout classification missing' }
if ($source -notmatch 'TIMEOUT:\{0\}:OUTPUT_DRAIN') { throw 'output drain timeout classification missing' }
if ($source -notmatch 'Stop-ActiveExternalProcesses') { throw 'failure cleanup hooks missing' }
if ($source -match 'Invoke-LocalRestore|LOCAL_RESTORE_APPLY|LOCAL_RESTORE_VERIFY_COUNTS|ping_restore|initdb|pg_ctl') { throw 'generic PostgreSQL restore path remains active' }
if ($source -notmatch 'managedSchemasExcludedFromApplicationDump') { throw 'managed-schema boundary missing' }
if ($source -notmatch 'SUPABASE_MANAGED_RECOVERY_ARTIFACT') { throw 'managed Auth recovery artifact missing' }
if ($source -notmatch 'SUPABASE_LOCAL_STACK_PASS') { throw 'Supabase local-stack rehearsal missing' }
if ($source -notmatch "'--table=auth.users'") { throw 'Auth users recovery export missing' }
if ($source -notmatch "'--table=auth.identities'") { throw 'Auth identities recovery export missing' }
if ($source -notmatch "'--data-only'") { throw 'Auth recovery local apply must be data-only' }
if ($source -notmatch "'--role-only'") { throw 'application roles export missing' }
if ($source -notmatch "if \(\$Kind -eq 'data'\) \{ \$arguments \+= @\('--data-only', '--schema', 'public,supabase_migrations'\) \}") { throw 'application data dump is not scoped to public/supabase_migrations' }
if ($source -notmatch 'supabase@2\.120\.0') { throw 'Supabase CLI version is not pinned' }
if ($source -notmatch 'localStackExclusions') { throw 'minimal local stack exclusions missing' }
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
Write-Output 'STAGE_MARKER_TESTS=PASS'
Write-Output 'PROCESS_TIMEOUT_TESTS=PASS'
Write-Output 'OUTPUT_DRAIN_TIMEOUT_TESTS=PASS'
Write-Output 'STORAGE_TIMEOUT_TESTS=PASS'
Write-Output 'FAILURE_CLEANUP_TESTS=PASS'
Write-Output 'SUPABASE_MANAGED_SCHEMA_BOUNDARY_TESTS=PASS'
Write-Output 'SUPABASE_LOCAL_STACK_REHEARSAL_TESTS=PASS'
$dumpRoot = Join-Path ([IO.Path]::GetTempPath()) ("ping-app-dump-boundary-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $dumpRoot -Force | Out-Null
try {
  $portable = Join-Path $dumpRoot 'application.sql'
  "CREATE TABLE public.example (id integer);`nREFERENCES auth.users(id);" | Set-Content -LiteralPath $portable -Encoding UTF8
  Assert-ApplicationDumpPortable @($portable)
  $managed = Join-Path $dumpRoot 'managed.sql'
  'CREATE TABLE auth.users (id uuid);' | Set-Content -LiteralPath $managed -Encoding UTF8
  try { Assert-ApplicationDumpPortable @($managed); throw 'managed schema was accepted' } catch { if ($_.Exception.Message -notmatch 'APPLICATION_DUMP_INCLUDES_MANAGED_SCHEMA') { throw } }
  $managedData = Join-Path $dumpRoot 'managed-data.sql'
  'INSERT INTO auth.users (id) VALUES (''11111111-1111-1111-1111-111111111111'');' | Set-Content -LiteralPath $managedData -Encoding UTF8
  try { Assert-ApplicationDumpPortable @($managedData); throw 'managed data insert was accepted' } catch { if ($_.Exception.Message -notmatch 'APPLICATION_DUMP_INCLUDES_MANAGED_SCHEMA') { throw } }
} finally {
  Remove-Item -LiteralPath $dumpRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output 'APPLICATION_DUMP_BOUNDARY_TESTS=PASS'
$portableSchemaRoot = Join-Path ([IO.Path]::GetTempPath()) ("ping-portable-schema-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $portableSchemaRoot -Force | Out-Null
try {
  $schemaWithPlatformPublic = Join-Path $portableSchemaRoot 'schema.sql'
  [IO.File]::WriteAllText($schemaWithPlatformPublic, "CREATE SCHEMA public;`nCREATE TABLE public.example (id integer);`n")
  $portableSchema = Get-PortableApplicationSchemaPath $schemaWithPlatformPublic $portableSchemaRoot
  if ((Get-Content -LiteralPath $portableSchema -Raw) -match '(?im)^\s*CREATE\s+SCHEMA\s+public\s*;') { throw 'platform public schema statement was not removed' }
} finally {
  Remove-Item -LiteralPath $portableSchemaRoot -Recurse -Force -ErrorAction SilentlyContinue
}
Write-Output 'PORTABLE_APPLICATION_SCHEMA_TESTS=PASS'
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
