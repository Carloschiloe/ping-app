import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string) => fs.readFileSync(path.join(__dirname, '..', relative), 'utf8');

describe('M8 live voice staging surface', () => {
    it('uses the authenticated staging broker and the existing Core boundary', () => {
        const source = read('src/components/agent/LiveVoiceSession.tsx');
        expect(source).toContain("/agent/voice/live/client");
        expect(source).toContain("config_requested");
        expect(source).toContain("native_ready");
        expect(source).toContain("protocolVersion: 1");
        expect(source).toContain("handshakeId");
        expect(source).toContain("message.type === 'retry'");
        expect(source).not.toContain("const LIVE_VOICE_HTML");
        expect(source).toContain("ping-config");
        expect(source).toContain("onLoadEnd={injectConfig}");
        expect(source).toContain("injectJavaScript(\"document.getElementById('stop')?.click();true;\")");
        expect(source).toContain("onRequestClose={requestClose}");
        expect(source).toContain("if (message.type === 'closed') scheduleClose()");
        expect(source).toContain("originWhitelist={['https://*']}");
        expect(source).toContain('getRecordingPermissionsAsync');
        expect(source).toContain('requestRecordingPermissionsAsync');
        expect(source).toContain('onPermissionRequest');
        expect(source).toContain("resource === 'AUDIO_CAPTURE'");
        expect(source).not.toContain('source={{ html:');
        expect(source).not.toContain("/agent/execute");
        expect(source).not.toContain("/agent/authorize");
    });

    it('enables the live surface only through an explicit build configuration flag', () => {
        const config = read('app.config.ts');
        const eas = read('eas.json');
        const packageJson = read('package.json');
        const updateScript = read('scripts/update-production.mjs');
        expect(config).toContain("const m8LiveVoiceEnabled = process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED === 'true'");
        expect(config).toContain("'android.permission.RECORD_AUDIO'");
        expect(config).toContain("'android.permission.MODIFY_AUDIO_SETTINGS'");
        expect(eas).toContain('EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED');
        expect(packageJson).toContain('"update:production": "node scripts/update-production.mjs"');
        expect(updateScript).toContain("EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED: 'true'");
        expect(updateScript).toContain("APP_VARIANT: 'production'");
        expect(config).toContain("versionCode: isStaging ? 4 : 14");
        expect(config).toContain("'./plugins/withRequiredMicrophonePermission'");
        expect(config).toContain("buildNumber: '4'");
    });

    it('keeps the Ping Voice entry point present in the production header', () => {
        const screen = read('src/screens/AgentPreviewScreen.tsx');
        expect(screen).toContain('testID="ping-voice-button"');
        expect(screen).toContain('accessibilityLabel="Abrir Ping Voz"');
        expect(screen).toContain('<Ionicons name="radio"');
    });
});
