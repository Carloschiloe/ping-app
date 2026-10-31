import { describe, expect, it } from 'vitest';
import {
    M8_VOICE_TRANSCRIPTION_ECHO_BROWSER_SOURCE,
    M8_VOICE_TRANSCRIPTION_PROMPT,
    isM8VoiceTranscriptionPromptEcho,
} from '../src/services/m8VoiceTranscriptionPrompt';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';

// Observed on a physical device: on silence the transcription model returned
// its own prompt, prefixed, and it reached Ping Core as a user turn.
const OBSERVED_ECHO = `contexto:\n${M8_VOICE_TRANSCRIPTION_PROMPT}`;

const browserEcho = new Function(
    `${M8_VOICE_TRANSCRIPTION_ECHO_BROWSER_SOURCE}; return isM8VoiceTranscriptionPromptEcho;`,
)() as (value: unknown) => boolean;

const cases: Array<[unknown, boolean]> = [
    [OBSERVED_ECHO, true],
    [M8_VOICE_TRANSCRIPTION_PROMPT, true],
    ['TRANSCRIBE EN ESPANOL DE CHILE.', true],
    ['Conserva nombres propios, fechas y horas', true],
    ['Recuérdame llamar a Prueba Ping mañana a las 10.', false],
    ['Llamar a Chile el lunes', false],
    ['Transcribe esta nota en español', false],
    ['Sí.', false],
    ['', false],
    [null, false],
];

describe('live voice transcription prompt echo', () => {
    it.each(cases)('server detects %j as echo=%s', (value, expected) => {
        expect(isM8VoiceTranscriptionPromptEcho(value)).toBe(expected);
    });

    it.each(cases)('browser copy detects %j as echo=%s', (value, expected) => {
        expect(browserEcho(value)).toBe(expected);
    });

    it('never treats an echoed prompt as a usable client transcript', () => {
        const previous = { environment: process.env.PING_ENVIRONMENT, enabled: process.env.M8_LIVE_VOICE_ENABLED };
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
        let html: string;
        try {
            html = getM8LiveVoiceClientHtml();
        } finally {
            if (previous.environment === undefined) delete process.env.PING_ENVIRONMENT; else process.env.PING_ENVIRONMENT = previous.environment;
            if (previous.enabled === undefined) delete process.env.M8_LIVE_VOICE_ENABLED; else process.env.M8_LIVE_VOICE_ENABLED = previous.enabled;
        }
        expect(html).toContain('const isM8VoiceTranscriptionPromptEcho=');
        expect(html).toContain("&&!isM8VoiceTranscriptionPromptEcho(value);");
    });
});
