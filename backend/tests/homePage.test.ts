import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { HOME_PAGE } from '../src/legal/home';

describe('vorian.app home page', () => {
    it('says what Vorian is, who runs it and links the legal pages', () => {
        expect(HOME_PAGE).toContain('Conversaciones que se convierten en compromisos cumplidos');
        expect(HOME_PAGE).toContain('Vorian es un producto de Marvex');
        expect(HOME_PAGE).toContain('mailto:carlos@marvex.cl');
        for (const path of ['/privacidad', '/terminos', '/cuenta/eliminar']) expect(HOME_PAGE).toContain(`href="${path}"`);
    });

    it('is served at the root address', () => {
        const app = readFileSync(join(__dirname, '../src/app.ts'), 'utf8');
        expect(app).toContain("['/', HOME_PAGE],");
    });
});
