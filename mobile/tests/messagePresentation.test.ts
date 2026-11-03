import { describe, expect, it } from 'vitest';
import { colors } from '../src/design/tokens';
import {
    getQuotedMessagePalette,
    getAudioMessagePalette,
    resolveMediaTapPresentation,
} from '../src/utils/messagePresentation';

describe('resolveMediaTapPresentation — video attachment root cause fix', () => {
    const SIGNED_URL = 'https://storage.example.com/storage/v1/object/sign/chat-media/conversations/c/attachments/u/11111111-1111-4111-8111-111111111111.mp4?token=abc';

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
        const urlWithMismatchedExtension = 'https://storage.example.com/storage/v1/object/sign/chat-media/x/y/z.bin?token=abc';
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
    it('on my blue bubble the quote is white', () => {
        const palette = getQuotedMessagePalette(true);
        expect(palette.nameColor).toBe(colors.onAccent);
        expect(palette.textColor).toBe(colors.onAccentSoft);
    });

    it('on the other person\'s bubble the quote uses the accent', () => {
        const palette = getQuotedMessagePalette(false);
        expect(palette.nameColor).toBe(colors.accentBright);
        expect(palette.textColor).toBe(colors.textSoft);
    });
});

describe('audio message presentation', () => {
    it('my audio is white on the blue bubble', () => {
        const palette = getAudioMessagePalette(true);
        expect(palette.iconColor).toBe(colors.onAccent);
        expect(palette.labelColor).toBe(colors.onAccent);
    });

    it('received audio uses the accent with readable text', () => {
        const palette = getAudioMessagePalette(false);
        expect(palette.iconColor).toBe(colors.accentBright);
        expect(palette.labelColor).toBe(colors.text);
    });
});
