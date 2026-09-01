import { parseDateFromText } from '../services/date-parser.service';

const ACTION_PATTERN = /\b(agend(?:a|ar|emos?)|tarea|compromiso|record(?:ar|atorio)|reuni[oó]n|cita|llam(?:ar|emos?)|envi(?:ar|emos?)|pag(?:ar|aremos?)|compr(?:ar|aremos?)|llev(?:ar|aremos?)|busc(?:ar|aremos?)|reserv(?:ar|aremos?)|entreg(?:ar|aremos?)|present(?:ar|aremos?)|hacer|tengo que|tenemos que|hay que|debemos|quedamos|ver|veremos|vemos|junt(?:ar(?:se|nos)?|amos|émonos)|ir a|iremos)\b/i;
const MEETING_PATTERN = /\b(reuni[oó]n|cita|llamada|llamar|junta|junt(?:ar(?:se|nos)?|amos|émonos)|ver|veremos|vemos|quedamos)\b/i;

export type DeterministicCommitmentSuggestion = {
    title: string;
    dueAt: string;
    assignedToUserId: null;
    replyText: string;
    type: 'task' | 'meeting';
};

type AiCommitmentSuggestion = {
    hasCommitment: boolean;
    title: string | null;
    dueAt: string | null;
    type: 'task' | 'meeting';
};

function cleanTitle(text: string, dateReference: string) {
    const withoutDate = text
        .replace(dateReference, ' ')
        .replace(/\b(?:a\s+las?|a\s+la)\s+(?:[01]?\d|2[0-3])(?:[:.][0-5]\d)?\s*(?:a\.?\s*m\.?|p\.?\s*m\.?)?\b/gi, ' ')
        .replace(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, ' ')
        .replace(/^\s*el\s+/i, '')
        .replace(/\s+/g, ' ')
        .replace(/^[,.;:\s]+|[,.;:\s]+$/g, '')
        .trim();

    return (withoutDate || text.trim()).slice(0, 60);
}

export function buildDeterministicCommitmentSuggestion(
    text: string,
    referenceDate: Date = new Date(),
    timeZone?: string | null,
): DeterministicCommitmentSuggestion | null {
    const normalized = text.trim();
    if (!normalized || !ACTION_PATTERN.test(normalized)) return null;

    const parsedDate = parseDateFromText(normalized, referenceDate, timeZone);
    if (!parsedDate) return null;

    return {
        title: cleanTitle(normalized, parsedDate.textRef),
        dueAt: parsedDate.date.toISOString(),
        assignedToUserId: null,
        replyText: 'Agendar',
        type: MEETING_PATTERN.test(normalized) ? 'meeting' : 'task',
    };
}

export function reconcileCommitmentSuggestion(
    ai: AiCommitmentSuggestion,
    deterministic: DeterministicCommitmentSuggestion | null
): DeterministicCommitmentSuggestion | null {
    if (deterministic) {
        return {
            ...deterministic,
            title: ai.hasCommitment && ai.title ? ai.title : deterministic.title,
            type: ai.hasCommitment ? ai.type : deterministic.type,
        };
    }

    if (!ai.hasCommitment || !ai.title || !ai.dueAt) return null;
    return {
        title: ai.title,
        dueAt: ai.dueAt,
        assignedToUserId: null,
        replyText: 'Agendar',
        type: ai.type,
    };
}
