import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { buildDayMarks, dayKey, monthGrid, weekDays } from '../src/utils/calendarDays';

describe('calendar days for the Hoy week strip', () => {
    it('a week runs Monday to Sunday', () => {
        const days = weekDays(new Date(2026, 10, 4)); // miércoles 4 de noviembre
        expect(days.map(dayKey)).toEqual([
            '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
        ]);
    });

    it('a month grid is made of whole weeks', () => {
        const days = monthGrid(new Date(2026, 10, 15));
        expect(days.length % 7).toBe(0);
        expect(dayKey(days[0])).toBe('2026-10-26');
        expect(dayKey(days[days.length - 1])).toBe('2026-12-06');
    });

    it('a late item marks its day red even if other items share it', () => {
        const at = (d: number) => new Date(2026, 10, d, 10).toISOString();
        const marks = buildDayMarks(
            [{ due_at: at(3), late: false }, { due_at: at(3), late: true }, { due_at: at(5), late: false }, { due_at: null }] as any,
            (c: any) => c.late,
        );
        expect(marks).toEqual({ '2026-11-03': 'overdue', '2026-11-05': 'pending' });
    });

    it('Hoy shows the strip above the list and a picked day shows only that day', () => {
        const hoy = fs.readFileSync(path.join(__dirname, '../src/screens/HoyScreen.tsx'), 'utf8');
        expect(hoy).toContain('<WeekStrip marks={dayMarks} selectedDay={selectedDay} onSelectDay={setSelectedDay} />');
        expect(hoy).toContain('isSameDay(new Date(c.due_at), selectedDay)');
        expect(hoy).toContain('No tienes nada para ese día.');
        const strip = fs.readFileSync(path.join(__dirname, '../src/components/hoy/WeekStrip.tsx'), 'utf8');
        expect(strip).toContain('onSelectDay(isSelected ? null : day)');
        expect(strip).toContain("accessibilityLabel={monthOpen ? 'Ver solo la semana' : 'Ver el mes'}");
    });
});

describe('the month view stays open while days are picked', () => {
    it('Hoy hands the list header over as an element, so the calendar is never remounted', () => {
        const hoy = fs.readFileSync(path.join(__dirname, '../src/screens/HoyScreen.tsx'), 'utf8');
        expect(hoy).toContain('ListHeaderComponent={renderListHeader()}');
    });
});
