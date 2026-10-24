import { describe, expect, it } from 'vitest';
import {
    AUTOMATION_DEFAULT_TIMEZONE,
    isMorningRoutineWindow,
    localDateKey,
    localDayName,
    resolveAutomationTimezone,
} from '../src/services/automationTimezone.service';

describe('automation timezone policy', () => {
    it('keeps the current Santiago behavior as the safe fallback', () => {
        expect(resolveAutomationTimezone()).toBe(AUTOMATION_DEFAULT_TIMEZONE);
        expect(resolveAutomationTimezone('Not/AZone')).toBe(AUTOMATION_DEFAULT_TIMEZONE);
        expect(resolveAutomationTimezone('UTC')).toBe('UTC');
    });

    it('uses the user timezone for calendar boundaries and local morning window', () => {
        const instant = new Date('2026-10-25T03:30:00.000Z');
        expect(localDateKey(instant, 'America/New_York')).toBe('2026-10-24');
        expect(localDateKey(instant, 'America/Santiago')).toBe('2026-10-25');
        expect(isMorningRoutineWindow(new Date('2026-10-25T11:02:00.000Z'), 'America/Santiago')).toBe(true);
        expect(isMorningRoutineWindow(new Date('2026-10-25T11:06:00.000Z'), 'America/Santiago')).toBe(false);
        expect(localDayName(new Date('2026-10-25T12:00:00.000Z'), 'America/Santiago')).toMatch(/domingo/i);
    });
});
