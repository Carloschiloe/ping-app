$ErrorActionPreference = 'Stop'

$mobileRoot = Split-Path -Parent $PSScriptRoot
$repoRoot = Split-Path -Parent $mobileRoot
$sdkRoot = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { 'C:\tmp\ping-android-sdk' }
$avdHome = if ($env:ANDROID_AVD_HOME) { $env:ANDROID_AVD_HOME } else { 'C:\tmp\ping-android-avd' }
$avdName = 'Ping_M8_API35'
$adb = Join-Path $sdkRoot 'platform-tools\adb.exe'
$emulator = Join-Path $sdkRoot 'emulator\emulator.exe'
$backendEnv = if ($env:PING_ANDROID_BACKEND_ENV) {
    [IO.Path]::GetFullPath($env:PING_ANDROID_BACKEND_ENV)
} else {
    Join-Path $repoRoot 'backend\.env'
}
$packageName = 'com.carloschiloe.ping.staging'

if (-not (Test-Path -LiteralPath $adb)) { throw "Android adb not found at $adb" }
if (-not (Test-Path -LiteralPath $emulator)) { throw "Android emulator not found at $emulator" }
if (-not (Test-Path -LiteralPath $backendEnv)) {
    throw "Missing local backend/.env. The script reads it in memory and never prints or writes its values."
}

$config = @{}
foreach ($line in Get-Content -LiteralPath $backendEnv) {
    if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$') {
        $config[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
    }
}

$expectedSupabaseHost = 'oonijgmddgyymhrlnvuu.supabase.co'
$supabaseUri = [Uri]$config['SUPABASE_URL']
if (-not $supabaseUri -or $supabaseUri.Host -ne $expectedSupabaseHost) {
    throw "Refusing to start: backend/.env is not configured for the staging Supabase project."
}
if ([string]::IsNullOrWhiteSpace($config['SUPABASE_ANON_KEY'])) {
    throw 'Missing SUPABASE_ANON_KEY in backend/.env.'
}

# Expo CLI resolves EXPO_PUBLIC_* values from the mobile project env files
# while transforming the Metro bundle. Generate the ignored local file from
# the authorized staging client configuration so the bundle cannot silently
# fall back to localhost. No server-only secret is copied.
$mobileEnv = Join-Path $mobileRoot '.env.local'
@(
    'APP_VARIANT=staging'
    'NODE_ENV=development'
    'EXPO_PUBLIC_API_URL=https://ping-backend-staging.onrender.com/api'
    'EXPO_PUBLIC_SUPABASE_PROJECT_REF=oonijgmddgyymhrlnvuu'
    "EXPO_PUBLIC_SUPABASE_URL=$($config['SUPABASE_URL'])"
    "EXPO_PUBLIC_SUPABASE_ANON_KEY=$($config['SUPABASE_ANON_KEY'])"
    'EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED=true'
) | Set-Content -LiteralPath $mobileEnv -Encoding utf8

$env:ANDROID_SDK_ROOT = $sdkRoot
$env:ANDROID_HOME = $sdkRoot
$env:ANDROID_AVD_HOME = $avdHome
$env:APP_VARIANT = 'staging'
$env:EXPO_PUBLIC_SUPABASE_PROJECT_REF = 'oonijgmddgyymhrlnvuu'
$env:EXPO_PUBLIC_SUPABASE_URL = $config['SUPABASE_URL']
$env:EXPO_PUBLIC_SUPABASE_ANON_KEY = $config['SUPABASE_ANON_KEY']
$env:EXPO_PUBLIC_API_URL = 'https://ping-backend-staging.onrender.com/api'
$env:EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED = 'true'
$env:NODE_ENV = 'development'
$env:EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK = '1'
$env:NODE_OPTIONS = '--max-old-space-size=8192'

if (-not (Test-Path -LiteralPath (Join-Path $avdHome "$avdName.avd"))) {
    throw "AVD $avdName is not installed under $avdHome."
}

$deviceState = (& $adb devices | Select-String '^emulator-\d+\s+device$')
if (-not $deviceState) {
    Start-Process -FilePath $emulator -WorkingDirectory (Split-Path -Parent $emulator) -ArgumentList @('-avd', $avdName, '-no-snapshot', '-no-boot-anim', '-gpu', 'auto') -WindowStyle Hidden
    & $adb wait-for-device | Out-Null
}
for ($i = 0; $i -lt 90; $i++) {
    if ((& $adb shell getprop sys.boot_completed 2>$null).Trim() -eq '1') { break }
    Start-Sleep -Seconds 2
}
if ((& $adb shell getprop sys.boot_completed 2>$null).Trim() -ne '1') { throw 'Android emulator did not finish booting.' }

$apk = Join-Path $mobileRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
 $installed = [bool](& $adb shell pm list packages | Select-String $packageName)
if (-not $installed) {
    if (-not (Test-Path -LiteralPath $apk)) {
        throw "Development APK not found at $apk. Build/install the SDK57 development client once before starting Metro."
    }
    & $adb install -r -d $apk | Out-Null
}

$metro = Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue
if (-not $metro) {
    $logOut = Join-Path $env:TEMP 'ping-m8-metro.out.log'
    $logErr = Join-Path $env:TEMP 'ping-m8-metro.err.log'
    Remove-Item -LiteralPath $logOut, $logErr -Force -ErrorAction SilentlyContinue
    # Expo CLI treats --offline as its own host mode and rejects combining it
    # with --lan/--tunnel. The emulator uses adb reverse, so the offline
    # manifest is the stable local development-client path we need here.
    Start-Process -FilePath 'node.exe' -ArgumentList @('.\node_modules\expo\bin\cli', 'start', '--dev-client', '--offline', '--port', '8081', '--clear') -WorkingDirectory $mobileRoot -RedirectStandardOutput $logOut -RedirectStandardError $logErr -WindowStyle Hidden | Out-Null
    for ($i = 0; $i -lt 60; $i++) {
        if (Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue) { break }
        Start-Sleep -Seconds 2
    }
}
if (-not (Get-NetTCPConnection -State Listen -LocalPort 8081 -ErrorAction SilentlyContinue)) { throw 'Metro did not open port 8081.' }

# The offline manifest advertises loopback. Reverse the port into the emulator
# and open the exact development-client URL so the launcher cannot reuse a
# stale server or fall back to Expo Go.
& $adb reverse tcp:8081 tcp:8081 | Out-Null
$devUrl = 'exp+mobile://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
& $adb shell am start -a android.intent.action.VIEW -d $devUrl | Out-Null
Write-Output "Android development session ready: $avdName / $packageName / staging"
Write-Output 'Metro is listening on offline development-client port 8081 with adb reverse. No secret values were printed or written.'
