import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');

describe('Glass under the phone clock', () => {
    it('Perfil and Ajustes never scroll content under the status bar', () => {
        for (const file of ['screens/ProfileScreen.tsx', 'screens/SettingsScreen.tsx']) {
            const source = read(file);
            expect(source, file).toContain('useTopGlass()');
            expect(source, file).toContain('{topGlass.glass}');
            expect(source, file).toContain('onScroll={topGlass.onScroll}');
        }
    });
});
