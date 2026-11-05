import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    if (!openai) openai = new OpenAI({ apiKey });
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
    const when = formatWhen(value?.date, value?.time, now);
    // The day and hour are written once, here, even if the model repeats them.
    const what = when ? clean(value?.what).replace(/,?\s*(a las|a la)\s+\d{1,2}(:\d{2})?\s*(hrs?\.?|am|pm)?/gi, '').trim() : clean(value?.what);
    return what && when ? `${what}: ${when}` : what;
};

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
    '"agreements": [{"what": what was agreed, without any date or time words, "date": "YYYY-MM-DD" or null, "time": "HH:MM" or null}], newest first,',
    '"pending": [{"person": first name, "items": what that person still has to do}],',
    '"latest": one sentence on where the conversation ended, without dates}.',
    'Use only what the messages say; leave a list empty when there is nothing for it.',
    'Every message starts with the date it was sent (YYYY-MM-DD and weekday). For each agreement work out the real date',
    'from that message\'s own date: "mañana" in a message of 2026-03-12 is 2026-03-13, "este jueves" is the next Thursday from it.',
].join(' ');

// Each message carries its own day, so the model can count from it.
const weekday = new Intl.DateTimeFormat('es-CL', { timeZone: TIME_ZONE, weekday: 'long' });

export const messageStamp = (iso: string) => {
    const date = new Date(iso);
    return `${isoDay.format(date)} ${weekday.format(date)} ${hourFormat.format(date)}`;
};

export const summarizeConversation = async (messages: any[]): Promise<ChatSummaryResult> => {
    if (!process.env.OPENAI_API_KEY) return { text: 'El resumen no está disponible en este momento.', sections: null };

    const formattedMessages = messages
        .filter((m) => typeof m.text === 'string' && m.text.trim())
        .map((m) => {
            const sender = m.profiles?.full_name || m.profiles?.email || 'Alguien';
            return `[${m.created_at ? messageStamp(m.created_at) : 'sin fecha'}] ${sender}: ${m.text}`;
        })
        .join('\n');

    try {
        const response = await getOpenAiClient().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: INSTRUCTIONS },
                { role: 'user', content: `Hoy es ${messageStamp(new Date().toISOString())}.\n\n${formattedMessages}` },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 700,
        });

        const sections = parseChatSummary(response.choices[0]?.message?.content || '');
        if (!sections) return { text: 'No se pudo generar el resumen.', sections: null };
        return { text: summaryText(sections), sections };
    } catch (err) {
        console.error('[Synthesis Service] Summarize failed:', err);
        return { text: 'No se pudo generar el resumen.', sections: null };
    }
};
