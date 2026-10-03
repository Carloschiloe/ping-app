import { describe, expect, it } from 'vitest';
import {
    EMPTY_CORE_PRESENTATION,
    buildM8VoiceCorePresentation,
} from '../src/services/m8VoicePresentation.service';
import { getM8LiveVoiceClientHtml } from '../src/services/m8LiveVoiceClient.service';

describe('M8 Voice ↔ Core presentation boundary', () => {
    it('preserves a normal Core response without changing its meaning', () => {
        expect(buildM8VoiceCorePresentation({
            kind: 'response',
            response: { answer: 'La revisión quedó registrada.', citations: [] },
        })).toEqual({
            kind: 'response',
            authorizedText: 'La revisión quedó registrada.',
            confirmationRequired: false,
        });
    });

    it('preserves clarification questions exactly', () => {
        expect(buildM8VoiceCorePresentation({
            kind: 'clarification',
            questions: [{ field: 'scope', question: '¿Qué alcance quieres revisar?' }],
        }).authorizedText).toBe('¿Qué alcance quieres revisar?');
    });

    it('uses an honest deterministic fallback for empty clarification', () => {
        const result = buildM8VoiceCorePresentation({ kind: 'clarification', questions: [] });
        expect(result.authorizedText).toBe(EMPTY_CORE_PRESENTATION);
        expect(result.authorizedText).not.toMatch(/causa|acceso|compromiso/i);
    });

    it('uses the same honest fallback for empty Core errors', () => {
        expect(buildM8VoiceCorePresentation({ kind: 'error' })).toMatchObject({
            kind: 'error',
            authorizedText: EMPTY_CORE_PRESENTATION,
            confirmationRequired: false,
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
        const result = buildM8VoiceCorePresentation({ kind: 'clarification', questions: [] });
        expect(result.authorizedText).not.toMatch(/acceso|calendario/i);
    });

    it('preserves plan confirmation semantics from Core presentation', () => {
        expect(buildM8VoiceCorePresentation({
            kind: 'plan',
            confirmationRequested: true,
            presentation: {
                summary: 'Se preparará la actualización.',
                headline: 'Actualizar',
                requiresExplicitConfirmation: true,
                confirmationLabel: 'Confirmar',
                cancelLabel: 'Cancelar',
            },
        })).toMatchObject({
            kind: 'plan',
            authorizedText: 'Se preparará la actualización.',
            confirmationRequired: true,
            confirmationLabel: 'Confirmar',
            cancelLabel: 'Cancelar',
        });
    });

    it('does not authorize pre-Core narration and sends only the Core projection', () => {
        process.env.PING_ENVIRONMENT = 'staging';
        const html = getM8LiveVoiceClientHtml('presentation-boundary-test');
        expect(html).toContain("stage:'tool_selection_output_ignored'");
        expect(html).toContain("core_presentation:presentation");
        expect(html).toContain('No generes texto narrativo ni audio en esta fase.');
        expect(html).toContain('No agregues hechos, razones, capacidades, accesos, memoria, resultados ni acciones');
    });

    it('keeps audio-before-Core blocked and preserves barge-in controls', () => {
        process.env.PING_ENVIRONMENT = 'staging';
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
