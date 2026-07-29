import { format } from 'date-fns';
import { parseDateFromText } from '../services/date-parser.service';

const ACTION_PATTERN = /\b(agend(?:a|ar|emos?)|tarea|compromiso|record(?:ar|atorio)|reuni[oó]n|cita|llam(?:ar|emos?)|envi(?:ar|emos?)|pag(?:ar|aremos?)|compr(?:ar|aremos?)|llev(?:ar|aremos?)|busc(?:ar|aremos?)|reserv(?:ar|aremos?)|entreg(?:ar|aremos?)|present(?:ar|aremos?)|hacer|tengo que|tenemos que|hay que|debemos|quedamos|ver|veremos|vemos|junt(?:ar|amos|émonos)|ir a|iremos)\b/i;
const MEETING_PATTERN = /\b(reuni[oó]n|cita|llamada|llamar|junta|junt(?:ar|amos|émonos)|ver|veremos|vemos|quedamos)\b/i;

export type DeterministicCommitmentSuggestion = {
    title: string;
    dueAt: string;
    assignedToUserId: null;
    replyText: string;
    type: 'task' | 'meeting';
};

function cleanTitle(text: string, dateReference: string) {
    const withoutDate = text
        .replace(dateReference, ' ')
        .replace(/\s+/g, ' ')
        .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
        .trim();

    return (withoutDate || text.trim()).slice(0, 60);
}

function toChileWallClock(date: Date) {
    // Chrono interpreta la expresión como hora local de calendario. El modelo
    // conceptual actual de Ping usa Chile (UTC-3) para sugerencias de beta.
    return `${format(date, "yyyy-MM-dd'T'HH:mm:ss")}-03:00`;
}

export function buildDeterministicCommitmentSuggestion(
    text: string,
    referenceDate: Date = new Date()
): DeterministicCommitmentSuggestion | null {
    const normalized = text.trim();
    if (!normalized || !ACTION_PATTERN.test(normalized)) return null;

    const parsedDate = parseDateFromText(normalized, referenceDate);
    if (!parsedDate) return null;

    return {
        title: cleanTitle(normalized, parsedDate.textRef),
        dueAt: toChileWallClock(parsedDate.date),
        assignedToUserId: null,
        replyText: 'Guardar',
        type: MEETING_PATTERN.test(normalized) ? 'meeting' : 'task',
    };
}
