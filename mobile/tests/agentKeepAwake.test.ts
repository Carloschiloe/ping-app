import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('voice keep-awake contract', () => {
    it('keeps the device awake for capture and processing, then releases it', () => {
        const source = readFileSync(resolve(process.cwd(), 'src/hooks/useAgentVoiceInput.ts'), 'utf8');
        expect(source).toContain("from 'expo-keep-awake'");
        expect(source).toContain("const VOICE_KEEP_AWAKE_TAG = 'ping-agent-voice'");
        expect(source).toContain('activateKeepAwakeAsync(VOICE_KEEP_AWAKE_TAG)');
        expect(source).toContain('deactivateKeepAwake(VOICE_KEEP_AWAKE_TAG)');
    });
});
