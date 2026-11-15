// Reads a meeting transcript and returns a summary, the decisions and the
// commitments it heard. Nothing here writes anything: the commitments are
// proposals that the user confirms before they become real ones.
import { timeZoneOffsetMs } from '../../utils/timezone';
import { MeetingLlm, MeetingLlmTarget, openAiCompatibleLlm } from './meetingLlm';
import { MeetingAnalysis, MeetingAnalysisRun, MeetingProviderError, ProposedMeetingCommitment } from './meetingTypes';

export const MEETING_ANALYSIS_VERSION = 'meet-v1';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Today and the next weeks as the user sees them, so no model does weekday arithmetic. */
export function meetingCalendar(now: Date, timeZone: string, days = 50): string {
    const local = new Date(now.getTime() + timeZoneOffsetMs(now, timeZone));
    const pad = (n: number) => String(n).padStart(2, '0');
    const lines: string[] = [];
    for (let i = 0; i < days; i += 1) {
        const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
        const label = i === 0 ? ' (hoy)' : i === 1 ? ' (mañana)' : '';
        lines.push(`${WEEKDAYS[day.getUTCDay()]} ${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}${label}`);
    }
    return lines.join('\n');
}

export const MEETING_ANALYSIS_SYSTEM = `Eres el analista de reuniones de Vorian, un asistente personal chileno. Recibes la transcripción de una llamada o reunión en español (a menudo chileno, con muletillas, interrupciones y errores de transcripción) y devuelves SOLO un objeto JSON.

Formato exacto:
{
  "summary": "resumen ejecutivo de 2 a 5 frases",
  "decisions": ["decisión del grupo que no es una tarea de alguien"],
  "commitments": [
    {
      "owner": "nombre de quien lo hará",
      "owner_is_user": true | false,
      "task": "qué hará, como se anotaría en una agenda (máx 70 caracteres, sin la fecha)",
      "due_date": "YYYY-MM-DD" | null,
      "due_text": "la fecha como se dijo" | null,
      "conditional": true | false,
      "condition": "de qué depende" | null,
      "depends_on": índice (desde 0) de otro compromiso de esta lista que debe cumplirse antes | null,
      "quote": "las palabras de la transcripción que lo respaldan",
      "confidence": "alta" | "media" | "baja"
    }
  ],
  "open_questions": ["tema que quedó sin resolver"]
}

Qué es un compromiso:
- Alguien de la reunión acepta hacer algo: lo ofrece ("yo te mando", "me encargo", "lo hago yo", "¿te parece si te envío...?" y le dicen que sí) o acepta un pedido ("ya", "dale", "sí, lo tienes el miércoles").
- Si alguien dice que le pedirá algo a otra persona ("le voy a pedir a Raúl que..."), el compromiso es de quien habla: "Pedirle a Raúl...".
- Un acuerdo de juntarse (reunión, visita, llamada con fecha) es un compromiso de quien lo propone o agenda.

Qué NO es un compromiso:
- Un pedido rechazado, sin respuesta o derivado a alguien que no lo aceptó.
- Ideas, hipótesis o deseos: "habría que", "sería bueno", "imagínate que", "lo vemos", "algún día".
- Cosas ya hechas o contadas en pasado.
- Algo que se dijo y luego se canceló o se declaró innecesario en la misma reunión.
- Decisiones del grupo sin una persona que las ejecute: van en "decisions".

Correcciones: si durante la reunión cambia el responsable, la fecha, la cantidad o el monto, usa SOLO la versión final. Nunca dejes la versión antigua.

Responsable: usa el nombre que aparece en la reunión. Si la transcripción tiene etiquetas como "A:" o "Hablante 1:", deduce el nombre por el contexto (cómo se llaman entre ellos y la lista de participantes); si no se puede, usa la etiqueta. Nunca inventes nombres. owner_is_user es true solo si el responsable es el dueño de Vorian que se indica abajo.

Fechas: lee el día en el calendario que viene en el mensaje; no calcules días de la semana por tu cuenta. Un día de la semana es su próxima fecha en el calendario (si es hoy, es dentro de una semana, salvo que digan "hoy"). "Fin de mes" es el último día del mes. "Pasado mañana" es dos días después de hoy. "En una semana" o "la otra semana" sin día exacto: hoy + 7. Si no se dijo fecha, null.

Condiciones y dependencias: conditional es true si solo se hará si ocurre algo ("si el cliente aprueba"). depends_on apunta a otro compromiso de la lista que debe cumplirse antes ("cuando Fernanda me pase los datos, armo el informe").

Confianza: "baja" cuando la persona no se comprometió del todo ("voy a tratar", "no te prometo") o la transcripción es dudosa.

Resumen: profesional, en español neutro, con los datos concretos (montos, cantidades, fechas, nombres) y sin inventar nada que no se haya dicho. Si no hubo compromisos, "commitments" es [].`;

export interface MeetingAnalysisInput {
    transcript: string;
    userName: string;
    participants?: string[];
    now: Date;
    timeZone: string;
    title?: string;
}

export function buildMeetingUserMessage(input: MeetingAnalysisInput): string {
    const nowLocal = new Date(input.now.getTime() + timeZoneOffsetMs(input.now, input.timeZone)).toISOString().slice(0, 16).replace('T', ' ');
    return [
        `Dueño de Vorian: ${input.userName}`,
        input.participants?.length ? `Participantes: ${input.participants.join(', ')}` : null,
        input.title ? `Reunión: ${input.title}` : null,
        `Ahora: ${nowLocal} (${input.timeZone})`,
        '',
        'Calendario:',
        meetingCalendar(input.now, input.timeZone),
        '',
        'Transcripción:',
        input.transcript,
    ].filter((line) => line !== null).join('\n');
}

const asString = (value: unknown, max = 400): string | null => {
    if (typeof value !== 'string') return null;
    const text = value.replace(/\s+/g, ' ').trim();
    return text ? text.slice(0, max) : null;
};

const asDate = (value: unknown): string | null => {
    const text = asString(value, 40);
    const match = text?.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
};

export function normalizeKey(text: string): string {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Turns whatever the model returned into a clean analysis, dropping broken or repeated items. */
export function normalizeMeetingAnalysis(raw: unknown, userName: string): MeetingAnalysis {
    if (!raw || typeof raw !== 'object') throw new MeetingProviderError('invalid_analysis', true);
    const data = raw as Record<string, any>;
    const list = (value: unknown) => (Array.isArray(value) ? value : []);
    const userKey = normalizeKey(userName);

    const items = list(data.commitments).map((item: any) => {
        const task = asString(item?.task, 120);
        if (!task) return null;
        const owner = asString(item?.owner, 80);
        const dependsOn = Number.isInteger(item?.depends_on) ? Number(item.depends_on) : null;
        const confidence = ['alta', 'media', 'baja'].includes(item?.confidence) ? item.confidence : 'media';
        const commitment: ProposedMeetingCommitment = {
            owner,
            ownerIsUser: item?.owner_is_user === true || (!!owner && normalizeKey(owner).split(' ')[0] === userKey.split(' ')[0]),
            task,
            dueDate: asDate(item?.due_date),
            dueText: asString(item?.due_text, 80),
            conditional: item?.conditional === true,
            condition: asString(item?.condition, 160),
            dependsOn,
            quote: asString(item?.quote, 300),
            confidence,
        };
        return commitment;
    });

    // Keep positions so depends_on still points at the right item after
    // dropping broken or repeated ones.
    const kept: ProposedMeetingCommitment[] = [];
    const newIndex = new Map<number, number>();
    const seen = new Map<string, number>();
    items.forEach((item, index) => {
        if (!item) return;
        const key = `${normalizeKey(item.owner || '')}|${normalizeKey(item.task)}|${item.dueDate || ''}`;
        if (seen.has(key)) { newIndex.set(index, seen.get(key)!); return; }
        seen.set(key, kept.length);
        newIndex.set(index, kept.length);
        kept.push(item);
    });
    kept.forEach((item, index) => {
        const target = item.dependsOn === null ? undefined : newIndex.get(item.dependsOn);
        item.dependsOn = target === undefined || target === index ? null : target;
    });

    return {
        summary: asString(data.summary, 2000) || '',
        decisions: list(data.decisions).map((d) => asString(d, 300)).filter((d): d is string => !!d),
        commitments: kept,
        openQuestions: list(data.open_questions).map((d) => asString(d, 300)).filter((d): d is string => !!d),
    };
}

/**
 * Analyses one transcript with the first target that answers; the next ones
 * are fallbacks when a provider is down, out of credit or returns broken JSON.
 */
export async function analyzeMeeting(
    input: MeetingAnalysisInput,
    targets: MeetingLlmTarget[],
    llm: MeetingLlm = openAiCompatibleLlm,
): Promise<MeetingAnalysisRun> {
    if (!input.transcript.trim()) throw new MeetingProviderError('empty_transcript', false);
    const user = buildMeetingUserMessage(input);
    let lastError: unknown = new MeetingProviderError('no_targets', false);
    let attempts = 0;
    for (const target of targets) {
        try {
            const result = await llm.completeJson(target, MEETING_ANALYSIS_SYSTEM, user);
            attempts += result.attempts;
            return {
                analysis: normalizeMeetingAnalysis(result.json, input.userName),
                provider: target.provider,
                model: target.model,
                latencyMs: result.latencyMs,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                attempts,
                costUsd: result.costUsd,
            };
        } catch (error) {
            attempts += 1;
            lastError = error;
        }
    }
    throw lastError;
}
