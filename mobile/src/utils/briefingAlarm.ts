import { configureBriefingAlarm } from '../../modules/vorian-alarm';

// The phone's own alarm for the day's summary, kept in step with Ajustes.

export type SummaryPrefs = {
    enabled: boolean;
    hour: number;
    minute: number;
    days: number[];
    firstName?: string | null;
};

export function greetingFor(hour: number): string {
    return hour < 12 ? 'Buenos días' : hour < 20 ? 'Buenas tardes' : 'Buenas noches';
}

export function briefingAlarmText(prefs: Pick<SummaryPrefs, 'hour' | 'firstName'>): { title: string; body: string } {
    const name = prefs.firstName?.trim() ? ` ${prefs.firstName.trim()}` : '';
    return { title: 'Vorian', body: `${greetingFor(prefs.hour)}${name} ☀️ ¿Te cuento tu día?` };
}

export function syncBriefingAlarm(prefs: SummaryPrefs): number | null {
    return configureBriefingAlarm({
        enabled: prefs.enabled && prefs.days.length > 0,
        hour: prefs.hour,
        minute: prefs.minute,
        days: prefs.days,
        ...briefingAlarmText(prefs),
    });
}
