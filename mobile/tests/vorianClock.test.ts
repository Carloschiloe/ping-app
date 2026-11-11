import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { compose, dayStrip, describeChoice, quickPicks } from '../src/utils/timePicker';

const read = (file: string) => fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
// Wednesday 11 November 2026, 14:20 local time.
const NOW = new Date(2026, 10, 11, 14, 20);

describe('Vorian clock', () => {
    it('one-tap choices set the day and the time together', () => {
        const picks = quickPicks(NOW);
        expect(picks.map((p) => p.label)).toEqual(['En 15 min', 'En 1 hora', 'Esta tarde', 'Mañana 9:00', 'En una semana']);
        expect(picks[0].at.getHours()).toBe(14);
        expect(picks[0].at.getMinutes()).toBe(35);
        expect(picks[3].at).toEqual(new Date(2026, 10, 12, 9, 0));
        // After six in the evening "this afternoon" is gone.
        expect(quickPicks(new Date(2026, 10, 11, 19, 0)).map((p) => p.label)).not.toContain('Esta tarde');
    });

    it('says in words what will be saved, minute by minute', () => {
        expect(describeChoice(compose(NOW, 9, 37), NOW)).toBe('Hoy a las 09:37');
        expect(describeChoice(compose(new Date(2026, 10, 12), 18, 5), NOW)).toBe('Mañana a las 18:05');
        expect(describeChoice(compose(new Date(2026, 10, 14), 10, 0), NOW)).toBe('Sábado 14 de noviembre a las 10:00');
        expect(describeChoice(compose(NOW, 7, 1), NOW, false)).toBe('Todos los días elegidos a las 07:01');
    });

    it('shows today first in the strip of days', () => {
        const days = dayStrip(NOW, 4);
        expect(days.map((d) => d.top)).toEqual(['hoy', 'mañ', 'vie', 'sáb']);
        expect(days[0].day).toBe(11);
    });

    it('replaces the Android clock everywhere a day or a time is chosen', () => {
        for (const file of [
            'components/perfil/SummaryTimeSheet.tsx',
            'components/compromisos/RescheduleModal.tsx',
            'components/compromisos/CloseCommitmentSheet.tsx',
            'components/AISuggestionModal.tsx',
        ]) {
            const source = read(file);
            expect(source, file).toContain('<VorianClock');
            expect(source, file).not.toContain('datetimepicker');
        }
        const clock = read('design/VorianClock.tsx');
        expect(clock).toContain('Array.from({ length: 60 }');
        expect(clock).not.toMatch(/['"]#[0-9a-fA-F]{3,8}['"]/);
    });
});
