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

export function parseChatSummary(raw: string): ChatSummary | null {
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
            agreements: cleanList(data?.agreements),
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
    '"agreements": short sentences with what was agreed (dates and times included),',
    '"pending": [{"person": first name, "items": what that person still has to do}],',
    '"latest": one sentence on where the conversation ended}.',
    'Use only what the messages say; leave a list empty when there is nothing for it.',
].join(' ');

export const summarizeConversation = async (messages: any[]): Promise<ChatSummaryResult> => {
    if (!process.env.OPENAI_API_KEY) return { text: 'El resumen no está disponible en este momento.', sections: null };

    const formattedMessages = messages
        .filter((m) => typeof m.text === 'string' && m.text.trim())
        .map((m) => {
            const sender = m.profiles?.full_name || m.profiles?.email || 'Alguien';
            const when = m.created_at ? new Date(m.created_at).toISOString().slice(0, 16).replace('T', ' ') : '';
            return `[${when}] ${sender}: ${m.text}`;
        })
        .join('\n');

    try {
        const response = await getOpenAiClient().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: INSTRUCTIONS },
                { role: 'user', content: formattedMessages },
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
