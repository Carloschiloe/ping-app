import { spawnSync } from 'node:child_process';

// EAS build profiles provide these values automatically, but `eas update`
// does not load the build profile's env block. Keep production OTA exports
// equivalent to production builds so a JS update cannot silently remove a
// capability that already exists in the installed native binary.
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, [
    'eas',
    'update',
    '--channel',
    'production',
    '--environment',
    'production',
    ...process.argv.slice(2),
], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
        ...process.env,
        EXPO_PUBLIC_ENABLE_AGENT_CONVERSATION_EVENTS: 'true',
        EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED: 'true',
        EXPO_ROUTER_DISABLE_RN_NAVIGATION_CHECK: '1',
    },
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

process.exit(result.status ?? 1);
