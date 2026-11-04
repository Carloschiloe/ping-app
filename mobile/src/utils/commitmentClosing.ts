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
