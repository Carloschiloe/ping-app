import OpenAI from 'openai';
import { createMeteredOpenAI } from './aiUsage.service';
import { extractExplicitTimeHint, parseDateFromText } from './date-parser.service';

let openai: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    if (!openai) openai = createMeteredOpenAI('resumen_chat', 'gpt-4o-mini', { apiKey });
    return openai;
}

// A chat summary for someone who does not want to read every message: what
// was agreed, what each person still has to do, and where the talk ended.
// The app draws each part on its own; `text` is the same summary as plain
// sentences for anything that can only show one string.
export interface ChatSummary {
    overview: string;
    agreements: string[];
    pending: Array<{ person: string; items: string[] }>;
    latest: string;
}

export interface ChatSummaryResult {
    text: string;
    sections: ChatSummary | null;
}

const clean = (value: unknown): string =>
    typeof value === 'string' ? value.replace(/[*_`#]+/g, '').replace(/\s+/g, ' ').trim() : '';

const cleanList = (value: unknown): string[] =>
    Array.isArray(value) ? value.map(clean).filter(Boolean).slice(0, 8) : [];

// Chile time, so a date always reads the way the people in the chat said it.
const TIME_ZONE = 'America/Santiago';
const isoDay = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const longDay = new Intl.DateTimeFormat('es-CL', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const hourFormat = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });

// The model only says which day and hour; the words are always written here,
// so a summary never says "mañana" about a message from March.
export function formatWhen(date: unknown, time: unknown, now: Date = new Date()): string {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '';
    const day = new Date(`${date}T12:00:00Z`);
    if (Number.isNaN(day.getTime())) return '';
    const year = date.slice(0, 4) === isoDay.format(now).slice(0, 4) ? '' : ` de ${date.slice(0, 4)}`;
    const hour = typeof time === 'string' && /^\d{1,2}:\d{2}$/.test(time) ? ` a las ${time.padStart(5, '0')}` : '';
    return `${longDay.format(day)}${year}${hour}`;
}

const agreementText = (value: any, now: Date): string => {
    if (typeof value === 'string') return clean(value);
    const what = clean(value?.what);
    const when = formatWhen(value?.date, value?.time, now);
    return what && when ? `${what}: ${when}` : what;
};

// Words that only make sense on the day they were written.
const RELATIVE_WORDS = /\b(pasado\s+mañana|mañana|hoy|ayer|(este|el|próximo|proximo)\s+(lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)(\s+(próximo|proximo|que\s+viene))?)\b/giu;

// "el 30 de marzo", "sábado 14 de marzo de 2026": the day is written after the colon instead.
const CALENDAR_DATE = /\b(el\s+)?((lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo)\s+)?\d{1,2}\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(\s+de\s+\d{4})?\b/giu;

/**
 * The model copies the exact day and hour words from one message; the same
 * date reader used for commitments turns them into a real date counted from
 * the day that message was sent. The model never does the arithmetic.
 */
export function resolveAgreement(value: any, source?: { text?: string | null; created_at?: string | null }): { what: string; date: string | null; time: string | null } {
    // When the model leaves the words out, the message itself still has them.
    const said = clean(value?.said) || clean(source?.text);
    const sentAt = source?.created_at;
    let what = clean(value?.what);
    if (said) what = what.replace(said, ' ');
    const time = said ? extractExplicitTimeHint(said) : null;
    if (time) what = what.replace(time, ' ');
    what = what.replace(RELATIVE_WORDS, ' ').replace(CALENDAR_DATE, ' ').replace(/\s+([,.;:])/g, '$1').replace(/;\s*/g, ', ').replace(/\s+/g, ' ').replace(/^[,;:\s]+|[,;:\s]+$/g, '')
        // A lone "a las" whose hour already went after the colon.
        .replace(/\s*\b(a|para)\s+las?\s*$/iu, '').trim();
    const reference = sentAt ? new Date(sentAt) : null;
    const parsed = said && reference && !Number.isNaN(reference.getTime()) ? parseDateFromText(said, reference, TIME_ZONE) : null;
    if (!parsed) return { what, date: null, time: null };
    return { what, date: isoDay.format(parsed.date), time: time ? hourFormat.format(parsed.date) : null };
}

// Newest agreed day first; the ones without a day go last.
const byNewest = (a: any, b: any) => {
    const key = (v: any) => (typeof v?.date === 'string' ? `${v.date} ${typeof v.time === 'string' ? v.time.padStart(5, '0') : ''}` : '');
    return key(b).localeCompare(key(a));
};

export function parseChatSummary(raw: string, now: Date = new Date()): ChatSummary | null {
    try {
        const data = JSON.parse(raw);
        const pending = Array.isArray(data?.pending)
            ? data.pending
                .map((p: any) => ({ person: clean(p?.person), items: cleanList(p?.items) }))
                .filter((p: { person: string; items: string[] }) => p.person && p.items.length)
                .slice(0, 8)
            : [];
        const summary: ChatSummary = {
            overview: clean(data?.overview),
            agreements: Array.isArray(data?.agreements)
                ? [...data.agreements].sort(byNewest).map((a: any) => agreementText(a, now)).filter(Boolean).slice(0, 8)
                : [],
            pending,
            latest: clean(data?.latest),
        };
        return summary.overview || summary.agreements.length || pending.length || summary.latest ? summary : null;
    } catch {
        return null;
    }
}

export function summaryText(summary: ChatSummary): string {
    const parts = [summary.overview];
    if (summary.agreements.length) parts.push(`Acuerdos: ${summary.agreements.join('; ')}.`);
    summary.pending.forEach((p) => parts.push(`${p.person} tiene pendiente: ${p.items.join('; ')}.`));
    if (summary.latest) parts.push(`Lo último: ${summary.latest}`);
    return parts.filter(Boolean).join('\n\n');
}

const INSTRUCTIONS = [
    'You summarize a work chat for someone who does not want to read every message.',
    'Write in the chat\'s language (usually Chilean Spanish), plain and brief, no markdown, no emojis.',
    'Reply with JSON only: {"overview": one or two sentences on what the chat is about,',
    '"agreements": [{"what": what was agreed, without day or time words, "message": the # of the message that set it,',
    '"said": the exact day and time words copied from that message, like "mañana a las 15:00", or ""}],',
    '"pending": [{"person": first name, "items": what that person still has to do}],',
    '"latest": one sentence on where the conversation ended, without dates}.',
    'Use only what the messages say; leave a list empty when there is nothing for it.',
    'List every agreement in the chat, up to 20, so none of the recent ones is left out.',
].join(' ');


export const summarizeConversation = async (messages: any[]): Promise<ChatSummaryResult> => {
    if (!process.env.OPENAI_API_KEY) return { text: 'El resumen no está disponible en este momento.', sections: null };

    const withText = messages.filter((m) => typeof m.text === 'string' && m.text.trim());
    const formattedMessages = withText
        .map((m, i) => `#${i} ${m.profiles?.full_name || m.profiles?.email || 'Alguien'}: ${m.text}`)
        .join('\n');
    // The model may answer 12, "12" or "#12".
    const messageAt = (ref: unknown) => {
        const digits = String(ref ?? '').replace(/\D/g, '');
        return digits ? withText[Number(digits)] : undefined;
    };

    try {
        const response = await getOpenAiClient().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: INSTRUCTIONS },
                { role: 'user', content: formattedMessages },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 1400,
        });

        const raw = JSON.parse(response.choices[0]?.message?.content || '{}');
        if (Array.isArray(raw?.agreements)) {
            raw.agreements = raw.agreements.map((a: any) =>
                typeof a === 'string' ? a : resolveAgreement(a, messageAt(a?.message)));
        }
        const sections = parseChatSummary(JSON.stringify(raw));
        if (!sections) return { text: 'No se pudo generar el resumen.', sections: null };
        return { text: summaryText(sections), sections };
    } catch (err) {
        console.error('[Synthesis Service] Summarize failed:', err);
        return { text: 'No se pudo generar el resumen.', sections: null };
    }
};
