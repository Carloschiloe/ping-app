import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CommitmentExtraction {
    hasCommitment: boolean;
    title: string | null;
    dueAt: string | null;       // ISO 8601 string or null
    replyText: string | null;   // confirmation message for the user
}

const SYSTEM_PROMPT = `Eres un asistente de productividad personal en español (Chile). Analizas mensajes de chat e identificas si el mensaje contiene un compromiso, tarea, recordatorio o evento con fecha/hora.

Extrae la siguiente información en JSON:
- hasCommitment (boolean): true si hay un compromiso, tarea o evento con fecha/hora implícita o explícita
- title (string | null): título corto y claro del compromiso (máx 60 caracteres)
- dueAt (string | null): fecha y hora en formato ISO 8601 (ej: 2026-03-05T15:00:00), calculada desde la fecha de hoy
- replyText (string | null): mensaje de confirmación amigable en español, confirmando el recordatorio

Reglas:
- Si no hay compromiso claro, devuelve hasCommitment: false y null en los demás campos  
- "mañana" = mañana del mismo día que se envía el mensaje
- Si no hay hora específica, usa las 09:00 del día correspondiente
- Interpreta lenguaje natural chileno: "la otra semana", "pasado", "en un rato", "a las 3", etc.
- El replyText debe ser natural y breve, ej: "✅ Te recuerdo el viernes a las 15:00."
- Usa el contexto completo del mensaje para entender compromisos implícitos

Responde SOLO con JSON válido, sin markdown.`;

export const extractCommitment = async (
    text: string,
    nowIso: string
): Promise<CommitmentExtraction> => {
    if (!process.env.OPENAI_API_KEY) {
        return { hasCommitment: false, title: null, dueAt: null, replyText: null };
    }

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: `Fecha y hora actual: ${nowIso}\n\nMensaje: "${text}"`
                }
            ],
            temperature: 0.1,
            max_tokens: 200,
            response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        return {
            hasCommitment: !!parsed.hasCommitment,
            title: parsed.title || null,
            dueAt: parsed.dueAt || null,
            replyText: parsed.replyText || null,
        };
    } catch (err) {
        console.error('[AI] extractCommitment failed:', err);
        return { hasCommitment: false, title: null, dueAt: null, replyText: null };
    }
};
