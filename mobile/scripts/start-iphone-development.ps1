$ErrorActionPreference = 'Stop'

$mobileRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $mobileRoot
try {
    $package = Get-Content -LiteralPath (Join-Path $mobileRoot 'package.json') -Raw | ConvertFrom-Json
    if (-not ($package.dependencies.expo -match '57')) {
        throw 'Expected Expo SDK 57 in this project.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $mobileRoot 'node_modules\expo-dev-client'))) {
        throw 'Install/build the SDK 57 development client first; Expo Go is not a compatible runtime.'
    }

    $env:APP_VARIANT = 'staging'
    $env:EXPO_PUBLIC_API_URL = 'https://ping-backend-staging.onrender.com/api'
    $env:EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED = 'true'
    $env:NODE_OPTIONS = '--max-old-space-size=8192'

    npx.cmd expo start --dev-client --tunnel --port 8085 --clear --max-workers 1
}
finally {
    Pop-Location
}
