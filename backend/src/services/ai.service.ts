import OpenAI from 'openai';
import fs from 'fs';

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

export const askPing = async (
    query: string,
    nowIso: string,
    context: { commitments: any[] }
): Promise<string> => {
    if (!process.env.OPENAI_API_KEY) {
        return 'Lo siento, no tengo acceso a mi cerebro de IA en este momento.';
    }

    const commitmentsText = context.commitments.length > 0
        ? context.commitments.map(c => `- ${c.title} (Para el ${new Date(c.due_at).toLocaleString('es-CL')})${c.status === 'completed' ? ' [COMPLETADO]' : ''}`).join('\n')
        : 'No hay compromisos registrados aún.';

    const systemPrompt = `Eres "Ping", el asistente inteligente del chat. Tu lema es "El chat que recuerda".
Tienes acceso a los compromisos y tareas del usuario para responder sus dudas.

Contexto Actual (${nowIso}):
COMPROMISOS DEL USUARIO:
${commitmentsText}

Reglas:
1. Responde de forma amable, breve y natural (estilo chileno si es apropiado, pero profesional).
2. Si te preguntan por algo que NO está en el contexto, di que no lo recuerdas o no lo tienes anotado.
3. Si te piden agendar algo, recuérdales que pueden hacerlo simplemente escribiendo el compromiso en cualquier chat.
4. Usa formato Markdown suave (negritas para fechas o títulos).`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: query }
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        return response.choices[0]?.message?.content || 'No supe qué responder, intenta de nuevo.';
    } catch (err) {
        console.error('[AI] askPing failed:', err);
        return 'Hubo un error al consultar a la IA.';
    }
};

export const transcribeAudio = async (filePath: string): Promise<string | null> => {
    if (!process.env.OPENAI_API_KEY) return null;

    try {
        const response = await openai.audio.transcriptions.create({
            file: fs.createReadStream(filePath),
            model: 'whisper-1',
            language: 'es',
        });
        return response.text;
    } catch (err) {
        console.error('[AI] Transcription failed:', err);
        return null;
    }
};

export const summarizeConversation = async (messages: any[]): Promise<string> => {
    if (!process.env.OPENAI_API_KEY) return 'Vaya, mi resumidor automático está fuera de línea.';

    const formattedMessages = messages
        .map(m => {
            const sender = m.profiles?.full_name || m.profiles?.email || 'Desconocido';
            return `${sender}: ${m.text}`;
        })
        .join('\n');

    const prompt = `Eres un experto en síntesis y productividad. Resume la siguiente conversación de chat en pocos puntos clave.
Enfócate en:
1. Acuerdos alcanzados.
2. Tareas pendientes (quién debe hacer qué).
3. Resumen general breve (máx 3 frases).

Conversación:
${formattedMessages}

Responde de forma ejecutiva, usando emojis y formato Markdown (negritas, listas).`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 600,
        });

        return response.choices[0]?.message?.content || 'No se pudo generar el resumen.';
    } catch (err) {
        console.error('[AI] Summarize failed:', err);
        return 'Error al generar el resumen.';
    }
};

/**
 * Phase 24: Generates a friendly morning summary message for the user.
 */
export const generateMorningSummary = async (
    userName: string,
    dayName: string,
    commitments: string[]
): Promise<string> => {
    if (!process.env.OPENAI_API_KEY) {
        return `¡Buenos días, ${userName}! Tienes ${commitments.length} compromiso(s) pendiente(s) para hoy.`;
    }

    const commitmentsList = commitments.map((c, i) => `${i + 1}. ${c}`).join('\n');
    const prompt = `Eres Ping, el asistente de productividad personal de ${userName}. Hoy es ${dayName}.
Redacta un mensaje de buenos días corto, amigable y motivador (máx 4 oraciones) para ${userName}, incluyendo un resumen de sus compromisos de hoy:

${commitmentsList}

Usando un tono cálido, en español chileno. No uses markdown, solo texto plano. Incluye algún emoji apropiado.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.85,
            max_tokens: 200,
        });
        return response.choices[0]?.message?.content || `¡Buenos días, ${userName}! ¿Listo para el día? Tienes ${commitments.length} cosa(s) pendiente(s).`;
    } catch (err) {
        console.error('[AI] generateMorningSummary failed:', err);
        return `¡Buenos días, ${userName}! Tienes ${commitments.length} compromiso(s) para hoy. ¡Tú puedes! 💪`;
    }
};
