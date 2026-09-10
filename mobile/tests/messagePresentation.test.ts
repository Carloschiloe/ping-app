import { describe, expect, it } from 'vitest';
import { lightTheme, darkTheme } from '../src/theme/theme';
import { getQuotedMessagePalette } from '../src/utils/messagePresentation';
import { getAudioMessagePalette } from '../src/utils/messagePresentation';
import { resolveMediaTapPresentation } from '../src/utils/messagePresentation';

describe('resolveMediaTapPresentation — video attachment root cause fix', () => {
    const SIGNED_URL = 'https://staging.supabase.co/storage/v1/object/sign/chat-media/conversations/c/attachments/u/11111111-1111-4111-8111-111111111111.mp4?token=abc';

    it('1) una imagen sigue clasificándose como imagen', () => {
        const presentation = resolveMediaTapPresentation(SIGNED_URL, 'image/jpeg');
        expect(presentation).toEqual({ kind: 'image', url: SIGNED_URL });
    });

    it('2) un video sigue clasificándose como video (no como imagen ni como externo)', () => {
        const presentation = resolveMediaTapPresentation(SIGNED_URL, 'video/mp4');
        expect(presentation).toEqual({ kind: 'video', url: SIGNED_URL });
    });

    it('2b) video/quicktime (iOS .mov) también se clasifica como video', () => {
        const presentation = resolveMediaTapPresentation(SIGNED_URL, 'video/quicktime');
        expect(presentation.kind).toBe('video');
    });

    it('3) preserva el MIME exacto recibido sin normalizarlo ni inferirlo de la URL', () => {
        // La URL firmada apunta a un objeto .mp4, pero la clasificación debe
        // depender únicamente del mimeType canónico del adjunto, nunca de la
        // extensión/forma de la URL firmada (metadata privada de storage).
        const urlWithMismatchedExtension = 'https://staging.supabase.co/storage/v1/object/sign/chat-media/x/y/z.bin?token=abc';
        const presentation = resolveMediaTapPresentation(urlWithMismatchedExtension, 'video/mp4');
        expect(presentation.kind).toBe('video');
        expect(presentation.url).toBe(urlWithMismatchedExtension);
    });

    it('5/6) un adjunto de video nunca se trata como "externo" (nunca abre el token/JSON firmado fuera de la app)', () => {
        const presentation = resolveMediaTapPresentation(SIGNED_URL, 'video/mp4');
        expect(presentation.kind).not.toBe('external');
    });

    it('MIME desconocido o ausente cae a presentación externa, no a imagen/video incorrectos', () => {
        expect(resolveMediaTapPresentation(SIGNED_URL, 'application/pdf').kind).toBe('external');
        expect(resolveMediaTapPresentation(SIGNED_URL, '').kind).toBe('external');
        expect(resolveMediaTapPresentation(SIGNED_URL, undefined).kind).toBe('external');
        expect(resolveMediaTapPresentation(SIGNED_URL, null).kind).toBe('external');
    });

    it('7) el flujo de foto existente permanece verde: imagen con MIME canónico intacto', () => {
        const presentation = resolveMediaTapPresentation(SIGNED_URL, 'image/png');
        expect(presentation.kind).toBe('image');
        expect(presentation.url).toBe(SIGNED_URL);
    });
});

describe('quoted reply presentation', () => {
    it('usa texto oscuro legible para una respuesta propia en tema claro', () => {
        const palette = getQuotedMessagePalette(true, false, lightTheme.colors);

        expect(palette.textColor).toBe(lightTheme.colors.text.primary);
        expect(palette.nameColor).toBe(lightTheme.colors.secondary);
        expect(palette.backgroundColor).not.toContain('255,255,255');
    });

    it('conserva texto claro para una respuesta propia en tema oscuro', () => {
        const palette = getQuotedMessagePalette(true, true, darkTheme.colors);

        expect(palette.nameColor).toBe(darkTheme.colors.white);
        expect(palette.textColor).toContain('255,255,255');
    });

    it('mantiene la paleta del interlocutor según el tema', () => {
        const palette = getQuotedMessagePalette(false, false, lightTheme.colors);

        expect(palette.backgroundColor).toBe(lightTheme.colors.background);
        expect(palette.textColor).toBe(lightTheme.colors.text.secondary);
    });
});

describe('audio message presentation', () => {
    it('usa texto oscuro del bubble propio en tema claro', () => {
        const palette = getAudioMessagePalette(true, lightTheme.colors);

        expect(palette.iconColor).toBe(lightTheme.colors.bubbleTextMe);
        expect(palette.labelColor).toBe('#111827');
        expect(palette.waveColor).not.toBe(lightTheme.colors.white);
    });

    it('usa texto claro del bubble propio en tema oscuro', () => {
        const palette = getAudioMessagePalette(true, darkTheme.colors);

        expect(palette.iconColor).toBe(darkTheme.colors.bubbleTextMe);
        expect(palette.labelColor).toBe('#f8fafc');
    });

    it('mantiene acento y texto legible en audio recibido', () => {
        const palette = getAudioMessagePalette(false, lightTheme.colors);

        expect(palette.iconColor).toBe(lightTheme.colors.accent);
        expect(palette.labelColor).toBe(lightTheme.colors.bubbleTextThem);
    });
});
