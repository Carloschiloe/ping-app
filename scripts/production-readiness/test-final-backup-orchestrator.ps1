$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'run-final-backup-and-precutover.ps1'
$tokens = $null
$errors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path $scriptPath), [ref]$tokens, [ref]$errors) | Out-Null
if ($errors.Count -gt 0) { throw "PowerShell parse errors: $($errors.Count)" }
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $scriptPath -ValidateOnly
if ($LASTEXITCODE -ne 0) { throw 'orchestrator validation failed' }
Write-Output 'FINAL_BACKUP_ORCHESTRATOR_OFFLINE=PASS'
