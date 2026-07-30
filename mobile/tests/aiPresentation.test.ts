import { describe, expect, it } from 'vitest';
import { normalizeAssistantText } from '../src/utils/aiPresentation';

describe('Ping AI presentation', () => {
    it('does not expose raw markdown markers in chat bubbles', () => {
        expect(normalizeAssistantText('Hoy es **jueves**.\n## Pendientes'))
            .toBe('Hoy es jueves.\nPendientes');
    });
});
