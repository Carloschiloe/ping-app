import * as chrono from 'chrono-node';

const PING_TIME_ZONE = 'America/Santiago';

export interface ParsedDateResult {
    date: Date;
    textRef: string;
}

type WallClockParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
};

const WEEKDAYS: Record<string, number> = {
    domingo: 0,
    lunes: 1,
    martes: 2,
    miercoles: 3,
    jueves: 4,
    viernes: 5,
    sabado: 6,
};

function normalizeSpanish(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

function chileWallClockParts(date: Date): WallClockParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: PING_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const values = Object.fromEntries(
        parts
            .filter((part) => part.type !== 'literal')
            .map((part) => [part.type, Number(part.value)])
    );

    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second,
    };
}

function wallClockToInstant(parts: WallClockParts): Date {
    const targetAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    );
    let guess = targetAsUtc;

    // Obtiene el offset efectivo de America/Santiago para la fecha exacta,
    // incluyendo cambios de horario de verano, sin depender de la zona del
    // servidor donde corre Ping.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const observed = chileWallClockParts(new Date(guess));
        const observedAsUtc = Date.UTC(
            observed.year,
            observed.month - 1,
            observed.day,
            observed.hour,
            observed.minute,
            observed.second
        );
        const correction = targetAsUtc - observedAsUtc;
        guess += correction;
        if (correction === 0) break;
    }

    return new Date(guess);
}

function explicitTimeFromText(text: string): { hour: number; minute: number } | null {
    const normalized = normalizeSpanish(text);
    const withPrefix = normalized.match(
        /\b(?:a\s+las?|a\s+la)\s+([01]?\d|2[0-3])(?:[:.]([0-5]\d))?\s*(a\.?\s*m\.?|p\.?\s*m\.?)?\b/i
    );
    const twentyFourHour = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const match = withPrefix || twentyFourHour;
    if (!match) return null;

    let hour = Number(match[1]);
    const minute = Number(match[2] || 0);
    const meridiem = (match[3] || '').replace(/[\s.]/g, '').toLowerCase();
    if (meridiem === 'pm' && hour < 12) hour += 12;
    if (meridiem === 'am' && hour === 12) hour = 0;
    return { hour, minute };
}

function parseExplicitWeekday(text: string, referenceDate: Date): ParsedDateResult | null {
    const weekdayMatch = text.match(
        /\b(?:(el|este|pr[oó]ximo)\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i
    );
    if (!weekdayMatch) return null;

    const reference = chileWallClockParts(referenceDate);
    const referenceCalendar = new Date(Date.UTC(reference.year, reference.month - 1, reference.day));
    const targetWeekday = WEEKDAYS[normalizeSpanish(weekdayMatch[2])];
    const currentWeekday = referenceCalendar.getUTCDay();
    const explicitTime = explicitTimeFromText(text);
    const hour = explicitTime?.hour ?? 12;
    const minute = explicitTime?.minute ?? 0;
    const qualifier = normalizeSpanish(weekdayMatch[1] || '');

    let daysAhead = (targetWeekday - currentWeekday + 7) % 7;
    const requestedTimeAlreadyPassed = daysAhead === 0
        && (hour < reference.hour || (hour === reference.hour && minute <= reference.minute));
    if (daysAhead === 0 && (qualifier === 'proximo' || requestedTimeAlreadyPassed)) {
        daysAhead = 7;
    }

    referenceCalendar.setUTCDate(referenceCalendar.getUTCDate() + daysAhead);
    return {
        date: wallClockToInstant({
            year: referenceCalendar.getUTCFullYear(),
            month: referenceCalendar.getUTCMonth() + 1,
            day: referenceCalendar.getUTCDate(),
            hour,
            minute,
            second: 0,
        }),
        textRef: weekdayMatch[0],
    };
}

export const parseDateFromText = (
    text: string,
    referenceDate: Date = new Date()
): ParsedDateResult | null => {
    const explicitWeekday = parseExplicitWeekday(text, referenceDate);
    if (explicitWeekday) return explicitWeekday;

    const reference = chileWallClockParts(referenceDate);
    // Chrono hace aritmética de calendario en la zona local del proceso. Esta
    // fecha sintética le entrega los campos de reloj de Chile y luego el
    // resultado se convierte a un instante real de America/Santiago.
    const chronoReference = new Date(
        reference.year,
        reference.month - 1,
        reference.day,
        reference.hour,
        reference.minute,
        reference.second
    );

    const results = chrono.es.parse(text, chronoReference, { forwardDate: true });
    const result = results[0] || chrono.parse(text, chronoReference, { forwardDate: true })[0];
    if (!result) return null;

    const parsed = result.start.date();
    return {
        date: wallClockToInstant({
            year: parsed.getFullYear(),
            month: parsed.getMonth() + 1,
            day: parsed.getDate(),
            hour: parsed.getHours(),
            minute: parsed.getMinutes(),
            second: parsed.getSeconds(),
        }),
        textRef: result.text,
    };
};
