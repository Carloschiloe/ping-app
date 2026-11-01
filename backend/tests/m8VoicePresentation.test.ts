import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
    EMPTY_CORE_PRESENTATION,
    buildM8VoiceCorePresentation,
} from '../src/services/m8VoicePresentation.service';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';

describe('M8 Voice ↔ Core presentation boundary', () => {
    beforeEach(() => {
        process.env.PING_ENVIRONMENT = 'production';
        process.env.M8_LIVE_VOICE_ENABLED = 'true';
    });

    afterEach(() => {
        delete process.env.M8_LIVE_VOICE_ENABLED;
    });

    it('preserves a normal Core response without changing its meaning', () => {
        expect(buildM8VoiceCorePresentation({
            kind: 'response',
            response: { answer: 'La revisión quedó registrada.', citations: [] },
        })).toEqual({
            kind: 'response',
            authorizedText: 'La revisión quedó registrada.',
        });
    });

    it('uses an honest deterministic fallback for an empty answer', () => {
        const result = buildM8VoiceCorePresentation({ kind: 'response', response: { answer: '  ' } });
        expect(result.authorizedText).toBe(EMPTY_CORE_PRESENTATION);
        expect(result.authorizedText).not.toMatch(/causa|acceso|compromiso/i);
    });

    it('uses the same honest fallback for empty Core errors', () => {
        expect(buildM8VoiceCorePresentation({ kind: 'error' })).toEqual({
            kind: 'error',
            authorizedText: EMPTY_CORE_PRESENTATION,
        });
    });

    it('allows an access statement only when Core explicitly supplies it', () => {
        const result = buildM8VoiceCorePresentation({
            kind: 'response',
            response: { answer: 'Core no tiene acceso a ese calendario.', citations: [] },
        });
        expect(result.authorizedText).toContain('no tiene acceso');
    });

    it('cannot manufacture an access statement when Core does not supply one', () => {
        const result = buildM8VoiceCorePresentation({ kind: 'response', response: {} });
        expect(result.authorizedText).not.toMatch(/acceso|calendario/i);
    });

    it('does not authorize pre-Core narration and sends only the Core projection', () => {
        process.env.PING_ENVIRONMENT = 'production';
        const html = getM8LiveVoiceClientHtml('presentation-boundary-test');
        expect(html).toContain("stage:'tool_selection_output_ignored'");
        expect(html).toContain("core_presentation:presentation");
        expect(html).toContain('No generes texto narrativo ni audio en esta fase.');
        expect(html).toContain('No agregues hechos, razones, capacidades, accesos, memoria, resultados ni acciones');
    });

    it('keeps audio-before-Core blocked and preserves barge-in controls', () => {
        process.env.PING_ENVIRONMENT = 'production';
        const html = getM8LiveVoiceClientHtml('audio-boundary-test');
        expect(html).toContain("detailCode:'audio_before_core_result'");
        expect(html).toContain("cancelResponse('speech_started_while_assistant_speaking')");
        expect(html).toContain("setAudioGate(false);outputPlaybackPending=false");
    });

    it('keeps long Core content bounded to the provider presentation contract', () => {
        const longAnswer = 'Contenido autorizado. '.repeat(100);
        const result = buildM8VoiceCorePresentation({ kind: 'response', response: { answer: longAnswer } });
        expect(result.authorizedText).toBe(longAnswer.trim());
        expect(result.authorizedText).not.toContain('no tiene acceso');
    });
});
