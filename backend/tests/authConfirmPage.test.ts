import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { AUTH_CONFIRM_PAGE, AUTH_CONFIRM_SCRIPT, AUTH_CONFIRM_SCRIPT_PATH } from '../src/legal/authConfirm';

describe('page the sign-up email lands on', () => {
    it('says the email is confirmed, or that the link no longer works', () => {
        expect(AUTH_CONFIRM_PAGE).toContain('Tu correo está confirmado');
        expect(AUTH_CONFIRM_PAGE).toContain('Este enlace ya no sirve');
        expect(AUTH_CONFIRM_PAGE).toContain('Abrir Vorian');
    });

    it('loads its script from a file, with no inline script', () => {
        expect(AUTH_CONFIRM_PAGE).toContain(`<script src="${AUTH_CONFIRM_SCRIPT_PATH}"></script>`);
        expect(AUTH_CONFIRM_PAGE).not.toMatch(/<script>/);
    });

    it('hands the sign-in on to the app and clears it from the address bar', () => {
        expect(AUTH_CONFIRM_SCRIPT).toContain("'ping://auth/callback' + search + hash");
        expect(AUTH_CONFIRM_SCRIPT).toContain('history.replaceState');
    });

    it('is served without caching', () => {
        const app = readFileSync(join(__dirname, '../src/app.ts'), 'utf8');
        expect(app).toContain('app.get(AUTH_CONFIRM_PATH');
        expect(app).toContain("res.setHeader('Cache-Control', 'no-store')");
    });
});
