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
        expect(source).not.toContain('source={{ html:');
        expect(source).not.toContain("/agent/execute");
        expect(source).not.toContain("/agent/authorize");
    });

    it('keeps the live surface staging-only at build configuration level', () => {
        const config = read('app.config.ts');
        const eas = read('eas.json');
        expect(config).toContain("const m8LiveVoiceEnabled = isStaging && process.env.EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED === 'true'");
        expect(eas).toContain('EXPO_PUBLIC_M8_LIVE_VOICE_ENABLED');
        expect(config).toContain("versionCode: isStaging ? 5 : 1");
        expect(config).toContain("buildNumber: '5'");
    });
});
