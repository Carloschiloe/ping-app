import OpenAI from 'openai';

let openai: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
    if (!openai) openai = new OpenAI({ apiKey });
    return openai;
}

/**
 * Summarizes a conversation using GPT-4o-mini.
 */
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
        const response = await getOpenAiClient().chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.5,
            max_tokens: 600,
        });

        return response.choices[0]?.message?.content || 'No se pudo generar el resumen.';
    } catch (err) {
        console.error('[Synthesis Service] Summarize failed:', err);
        return 'Error al generar el resumen.';
    }
};
