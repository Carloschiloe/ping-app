import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('calendar OAuth handoff', () => {
    it('does not place a Supabase access token in a browser URL', () => {
        const source = fs.readFileSync(
            path.join(__dirname, '../src/components/perfil/CalendarsSheet.tsx'),
            'utf8',
        );

        expect(source).not.toContain('?token=');
        expect(source).not.toContain('session.access_token');
        expect(source).toContain('/calendar/auth/google/link');
        expect(source).toContain('/calendar/auth/outlook/link');
    });
});
