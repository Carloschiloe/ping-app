import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: async () => null, setItem: async () => undefined },
}));
const configure = vi.fn((_input: unknown) => 1);
vi.mock('../modules/vorian-alarm', () => ({ configureBriefingAlarm: (input: unknown) => configure(input) }));

const root = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('«Hola Vorian»', () => {
    it('opens the voice on a greeting with the name, also when it is heard a bit off', async () => {
        const { isWakePhrase } = await import('../src/utils/wakeWord');
        for (const heard of ['Hola Vorian', 'hola, Borian', 'Oye Florian', 'ok vorian ¿estás?', 'Vorian', 'HOLA VORIÁN']) {
            expect(isWakePhrase(heard)).toBe(true);
        }
    });

    it('ignores ordinary talk that only mentions the name', async () => {
        const { isWakePhrase } = await import('../src/utils/wakeWord');
        for (const heard of ['hola', 'le dije a vorian que', 'mañana llamo a Dorian Gray', '', null]) {
            expect(isWakePhrase(heard)).toBe(false);
        }
    });

    it('stops listening while a call or the live voice uses the microphone', () => {
        const hook = read('src/hooks/useWakeWord.ts');
        expect(hook).toContain('isMicBusy');
        expect(read('src/screens/CallScreen.tsx')).toContain("setMicBusy('call', true)");
        expect(read('src/components/agent/LiveVoiceSession.tsx')).toContain("setMicBusy('live-voice'");
    });
});

describe('Summary alarm on the phone', () => {
    it('greets by name at the chosen time and turns off when no day is chosen', async () => {
        const { briefingAlarmText, syncBriefingAlarm } = await import('../src/utils/briefingAlarm');
        expect(briefingAlarmText({ hour: 7, firstName: 'Carlos' }).body).toBe('Buenos días Carlos ☀️ ¿Te cuento tu día?');
        expect(briefingAlarmText({ hour: 21 }).body).toBe('Buenas noches ☀️ ¿Te cuento tu día?');

        syncBriefingAlarm({ enabled: true, hour: 7, minute: 30, days: [], firstName: 'Carlos' });
        expect(configure).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false, hour: 7, minute: 30 }));
    });

    it('asks the server for the day when the alarm opens the app', () => {
        expect(read('src/screens/AgentPreviewScreen.tsx')).toContain("apiClient.post('/agent/briefing'");
        expect(read('src/hooks/useVoiceLinks.ts')).toContain("'ping://briefing'");
        expect(read('src/hooks/useVoiceLinks.ts')).toContain("'ping://voz'");
    });
});

describe('App 1.0.5', () => {
    it('ships the alarm and speech pieces to the build, and Firebase when the file is there', () => {
        const easignore = read('.easignore');
        expect(easignore).not.toMatch(/^\*\*\/android\/$/m);
        expect(easignore).toMatch(/^\/android\/$/m);
        const config = read('app.config.ts');
        expect(config).toContain("googleServicesFile: './google-services.json'");
        expect(config).toContain("'expo-speech-recognition'");
        expect(read('modules/vorian-alarm/android/src/main/AndroidManifest.xml')).toContain('USE_FULL_SCREEN_INTENT');
    });
});
