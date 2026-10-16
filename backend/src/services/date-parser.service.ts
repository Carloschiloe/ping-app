import * as chrono from 'chrono-node';

const DEFAULT_TIME_ZONE = 'America/Santiago';

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

// Horas habladas en español. Esta tabla debe vivir en el parser canónico:
// la rama de día de semana se resuelve antes de Chrono y, sin ella,
// expresiones como "a las siete" caen silenciosamente en 12:00.
const SPANISH_HOUR_WORDS: Record<string, number> = {
    una: 1,
    uno: 1,
    dos: 2,
    tres: 3,
    cuatro: 4,
    cinco: 5,
    seis: 6,
    siete: 7,
    ocho: 8,
    nueve: 9,
    diez: 10,
    once: 11,
    doce: 12,
    trece: 13,
    catorce: 14,
    quince: 15,
    dieciseis: 16,
    diecisiete: 17,
    dieciocho: 18,
    diecinueve: 19,
    veinte: 20,
    veintiuno: 21,
    veintidos: 22,
    veintitres: 23,
};

function normalizeSpanish(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function resolveTimeZone(timeZone?: string | null): string {
    const candidate = timeZone?.trim();
    if (!candidate) return DEFAULT_TIME_ZONE;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(0);
        return candidate;
    } catch {
        return DEFAULT_TIME_ZONE;
    }
}

function wallClockParts(date: Date, timeZone: string): WallClockParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
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

function wallClockToInstant(parts: WallClockParts, timeZone: string): Date {
    const targetAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second
    );
    let guess = targetAsUtc;

    // Obtiene el offset efectivo de la zona IANA para la fecha exacta,
    // incluyendo cambios de horario de verano, sin depender de la zona del
    // servidor donde corre Ping.
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const observed = wallClockParts(new Date(guess), timeZone);
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

function applyMeridiem(hour: number, meridiem: string): number {
    const normalized = meridiem.replace(/[\s.]/g, '').toLowerCase();
    const isAfternoonOrNight = normalized === 'pm'
        || normalized.includes('tarde')
        || normalized.includes('noche');
    const isMorning = normalized === 'am' || normalized.includes('manana');
    if (isAfternoonOrNight && hour < 12) return hour + 12;
    if (isMorning && hour === 12) return 0;
    return hour;
}

function explicitTimeFromText(text: string): { hour: number; minute: number } | null {
    const normalized = normalizeSpanish(text);
    const meridiem = '(?:a\\.?\\s*m\\.?|p\\.?\\s*m\\.?|de\\s+la\\s+(?:manana|tarde|noche))';
    const withPrefix = normalized.match(
        new RegExp(`\\b(?:a\\s+las?|a\\s+la)\\s+([01]?\\d|2[0-3])(?:[:.]([0-5]\\d))?\\s*(${meridiem})?`, 'i')
    );
    const twentyFourHour = normalized.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (withPrefix) {
        return {
            hour: applyMeridiem(Number(withPrefix[1]), withPrefix[3] || ''),
            minute: Number(withPrefix[2] || 0),
        };
    }
    if (twentyFourHour) {
        return { hour: Number(twentyFourHour[1]), minute: Number(twentyFourHour[2] || 0) };
    }

    const hourWords = Object.keys(SPANISH_HOUR_WORDS)
        .sort((a, b) => b.length - a.length)
        .join('|');
    const wordTime = normalized.match(
        new RegExp(`\\b(?:a\\s+las?|a\\s+la)\\s+(${hourWords})(?:\\s+(y\\s+(?:media|cuarto)|menos\\s+cuarto))?\\s*(${meridiem})?`, 'i')
    );
    if (!wordTime) return null;

    let hour = SPANISH_HOUR_WORDS[wordTime[1].toLowerCase()];
    let minute = 0;
    const minutePhrase = (wordTime[2] || '').toLowerCase();
    if (minutePhrase.includes('media')) minute = 30;
    if (minutePhrase.includes('cuarto')) {
        if (minutePhrase.startsWith('menos')) hour = hour === 1 ? 12 : hour - 1;
        minute = minutePhrase.startsWith('menos') ? 45 : 15;
    }
    return { hour: applyMeridiem(hour, wordTime[3] || ''), minute };
}

function parseExplicitWeekday(
    text: string,
    referenceDate: Date,
    timeZone: string,
): ParsedDateResult | null {
    const weekdayMatch = text.match(
        /\b(?:(el|este|pr[oó]ximo)\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/i
    );
    if (!weekdayMatch) return null;

    const reference = wallClockParts(referenceDate, timeZone);
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
        }, timeZone),
        textRef: weekdayMatch[0],
    };
}

export const parseDateFromText = (
    text: string,
    referenceDate: Date = new Date(),
    requestedTimeZone?: string | null,
): ParsedDateResult | null => {
    const timeZone = resolveTimeZone(requestedTimeZone);
    const explicitWeekday = parseExplicitWeekday(text, referenceDate, timeZone);
    if (explicitWeekday) return explicitWeekday;

    const reference = wallClockParts(referenceDate, timeZone);
    // Chrono hace aritmética de calendario en la zona local del proceso. Esta
    // fecha sintética le entrega los campos de reloj del usuario y luego el
    // resultado se convierte a un instante real de esa misma zona IANA.
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
    const explicitTime = explicitTimeFromText(text);
    return {
        date: wallClockToInstant({
            year: parsed.getFullYear(),
            month: parsed.getMonth() + 1,
            day: parsed.getDate(),
            hour: explicitTime?.hour ?? parsed.getHours(),
            minute: explicitTime?.minute ?? parsed.getMinutes(),
            second: explicitTime ? 0 : parsed.getSeconds(),
        }, timeZone),
        textRef: result.text,
    };
};
