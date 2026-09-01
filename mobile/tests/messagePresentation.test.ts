import { describe, expect, it } from 'vitest';
import { lightTheme, darkTheme } from '../src/theme/theme';
import { getQuotedMessagePalette } from '../src/utils/messagePresentation';
import { getAudioMessagePalette } from '../src/utils/messagePresentation';

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
