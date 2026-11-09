import { describe, expect, it } from 'vitest';
import { M8_VOICE_PRESENTATION_BROWSER_SOURCE, buildM8VoiceCorePresentation, speakForVoice } from '../src/services/m8VoicePresentation.service';
import { buildSessionConfig } from '../src/services/m8LiveVoice.service';
import { clampSpeed } from '../src/services/voiceSettings.service';

const SAMPLES = [
    'La revisión quedó registrada.',
    '**Tienes 2 compromisos:**\n- Reunión con Ana\n- Pagar la luz',
    '## Hoy\n1. Llamar a Pedro a las 15:00 hrs\n2) Enviar el informe 🙂',
    'Listo ✅ quedó para el jueves a las 9:30 hrs.',
    '  ',
];

describe('what the voice reads aloud', () => {
    it('drops screen formatting but keeps every word', () => {
        expect(speakForVoice('**Tienes 2 compromisos:**\n- Reunión con Ana\n- Pagar la luz'))
            .toBe('Tienes 2 compromisos: Reunión con Ana. Pagar la luz');
        expect(speakForVoice('## Hoy\n1. Llamar a Pedro a las 15:00 hrs\n2) Enviar el informe 🙂'))
            .toBe('Hoy. Llamar a Pedro a las 15:00 horas. Enviar el informe');
        expect(speakForVoice('Listo ✅ quedó para el jueves a las 9:30 hrs.')).toBe('Listo quedó para el jueves a las 9:30 horas.');
    });

    it('leaves a plain sentence exactly as it was', () => {
        expect(speakForVoice('La revisión quedó registrada.')).toBe('La revisión quedó registrada.');
        expect(buildM8VoiceCorePresentation({ kind: 'response', response: { answer: 'Mañana a las tres.' } }).authorizedText).toBe('Mañana a las tres.');
    });

    it('the voice page cleans the text exactly like the server', () => {
        const browser = new Function(`${M8_VOICE_PRESENTATION_BROWSER_SOURCE}; return buildM8VoiceCorePresentation;`)() as typeof buildM8VoiceCorePresentation;
        for (const answer of SAMPLES) {
            const core = { kind: 'response', response: { answer } };
            expect(browser(core)).toEqual(buildM8VoiceCorePresentation(core));
        }
    });
});

describe('the voice page', () => {
    it('still runs: its scripts are valid JavaScript', async () => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
        const { getM8LiveVoiceClientHtml } = await import('../src/services/m8LiveVoiceClient.service');
        const html = getM8LiveVoiceClientHtml('voice-natural-test');
        const scripts = (html.match(/<script[^>]*>[\s\S]*?<\/script>/g) ?? []).map((s) => s.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
        expect(scripts.length).toBeGreaterThan(0);
        for (const code of scripts) expect(() => new Function(code)).not.toThrow();
        expect(html).toContain('speakForVoice(value.response.answer)');
        delete process.env.M8_LIVE_VOICE_ENABLED;
    });
});

describe('voice and speed chosen in the panel', () => {
    const request = { sdp: 'v=0', locale: 'es-CL', timezone: 'America/Santiago' } as any;

    it('uses the chosen voice, and sends a speed only when it is not normal', () => {
        expect(buildSessionConfig(request, 'gpt-realtime-2.1', { voice: 'marin', speed: 1 }).audio.output).toEqual({ voice: 'marin' });
        expect(buildSessionConfig(request, 'gpt-realtime-2.1', { voice: 'cedar', speed: 0.95 }).audio.output).toEqual({ voice: 'cedar', speed: 0.95 });
    });

    it('keeps the speed between 0.8 and 1.2', () => {
        expect(clampSpeed(2)).toBe(1.2);
        expect(clampSpeed(0.1)).toBe(0.8);
        expect(clampSpeed('abc')).toBe(1);
        expect(clampSpeed(0.953)).toBe(0.95);
    });
});

describe('voice samples in the panel', () => {
    it('makes each sample once and then reuses it', async () => {
        const { voiceSample, SAMPLE_TEXT } = await import('../src/services/voiceSettings.service');
        const original = global.fetch;
        const calls: any[] = [];
        process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'sk-test';
        global.fetch = (async (url: string, init: any) => {
            calls.push({ url, body: JSON.parse(init.body) });
            return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
        }) as any;
        try {
            const first = await voiceSample('marin');
            const second = await voiceSample('marin');
            expect(first.length).toBe(3);
            expect(second).toBe(first);
            expect(calls).toHaveLength(1);
            expect(calls[0].url).toContain('/v1/audio/speech');
            expect(calls[0].body).toMatchObject({ voice: 'marin', input: SAMPLE_TEXT });
        } finally {
            global.fetch = original;
        }
    });
});
