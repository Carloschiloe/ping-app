const DEFAULT_TIME_ZONE = 'America/Santiago';

type LocalDateParts = {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
};

function getLocalDateParts(date: Date, timeZone: string): LocalDateParts {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(date);
    const value = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((part) => part.type === type)?.value || 0);

    return {
        year: value('year'),
        month: value('month'),
        day: value('day'),
        hour: value('hour'),
        minute: value('minute'),
    };
}

function localDayNumber(parts: Pick<LocalDateParts, 'year' | 'month' | 'day'>): number {
    return Math.floor(Date.UTC(parts.year, parts.month - 1, parts.day) / 86_400_000);
}

function weekRelation(nowParts: LocalDateParts, dueParts: LocalDateParts): string {
    const nowDay = localDayNumber(nowParts);
    const dueDay = localDayNumber(dueParts);
    const weekday = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)).getUTCDay();
    const daysSinceMonday = (weekday + 6) % 7;
    const currentWeekStart = nowDay - daysSinceMonday;
    const nextWeekStart = currentWeekStart + 7;

    if (dueDay < nowDay) return 'pasado';
    if (dueDay >= currentWeekStart && dueDay < nextWeekStart) return 'esta_semana';
    if (dueDay >= nextWeekStart && dueDay < nextWeekStart + 7) return 'proxima_semana';
    return 'posterior';
}

function formatVerifiedDate(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('es-CL', {
        timeZone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
    }).format(date);
}

export function buildVerifiedTemporalContext(
    nowIso: string,
    commitments: any[],
    timeZone = DEFAULT_TIME_ZONE
) {
    const now = new Date(nowIso);
    if (Number.isNaN(now.getTime())) throw new Error('Invalid current timestamp');
    const nowParts = getLocalDateParts(now, timeZone);

    const verifiedCommitments = commitments.map((commitment) => {
        const due = commitment.due_at ? new Date(commitment.due_at) : null;
        const hasValidDue = due && !Number.isNaN(due.getTime());
        const dueParts = hasValidDue ? getLocalDateParts(due, timeZone) : null;

        return {
            id: commitment.id,
            title: commitment.title,
            status: commitment.status,
            dueAt: hasValidDue ? due!.toISOString() : null,
            verifiedLocalDate: hasValidDue ? formatVerifiedDate(due!, timeZone) : 'Sin fecha',
            weekRelation: dueParts ? weekRelation(nowParts, dueParts) : 'sin_fecha',
        };
    });

    return {
        timeZone,
        nowIso: now.toISOString(),
        verifiedNow: formatVerifiedDate(now, timeZone),
        commitments: verifiedCommitments,
    };
}
