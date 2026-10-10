$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'run-final-backup-and-precutover.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath), [ref]$tokens, [ref]$errors)
if ($errors.Count -gt 0) { throw "PowerShell parse errors: $($errors.Count)" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -ValidateOnly
if ($LASTEXITCODE -ne 0) { throw 'orchestrator validation failed' }

$projectRef = 'wbigqhtuzfmpnxservlf'
$functionNames = @('Get-PostgresMajorRank', 'Get-PostgresSearchRoots', 'Select-PostgresClientCandidate', 'Assert-PublicRowCounts')
foreach ($functionName in $functionNames) {
  $functionAst = $ast.Find({ param($node) $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $functionName }, $true)
  if (-not $functionAst) { throw "missing function: $functionName" }
  Invoke-Expression $functionAst.Extent.Text
}
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
