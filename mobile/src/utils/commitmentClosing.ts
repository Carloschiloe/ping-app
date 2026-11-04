export type CloseOutcome = 'done' | 'partial' | 'not_done';

// The text saved as "how it went". The server needs a few words, so a very
// short note is kept next to the outcome instead of standing alone.
export function closingResult(outcome: CloseOutcome, note: string, isMeeting = false): string {
    const text = note.trim();
    if (outcome === 'partial') {
        const label = isMeeting ? 'Quedó algo pendiente' : 'Hecho a medias';
        return text ? `${label}: ${text}` : `${label}.`;
    }
    const label = outcome === 'not_done' ? 'No se hizo' : isMeeting ? 'Se hizo' : 'Hecho';
    if (!text) return `${label}.`;
    return text.length >= 3 ? text : `${label}: ${text}`;
}

// Quick choices for when the rest gets done.
export function remainingDueOptions(now: Date): { label: string; date: Date }[] {
    const at = (days: number) => {
        const d = new Date(now);
        d.setDate(d.getDate() + days);
        d.setHours(10, 0, 0, 0);
        return d;
    };
    return [
        { label: 'Mañana', date: at(1) },
        { label: 'En 3 días', date: at(3) },
        { label: 'Próxima semana', date: at(7) },
    ];
}
