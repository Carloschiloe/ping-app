import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        const response = await openai.chat.completions.create({
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

/**
 * Generates a friendly morning summary message.
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
        console.error('[Synthesis Service] Morning summary failed:', err);
        return `¡Buenos días, ${userName}! Tienes ${commitments.length} compromiso(s) para hoy. ¡Tú puedes! 💪`;
    }
};

/**
 * Generates the Weekly Review message for Friday evening.
 */
export const generateWeeklyReview = async (
    userName: string,
    completedCount: number,
    pendingCount: number,
    pendingTitles: string[]
): Promise<string> => {
    if (!process.env.OPENAI_API_KEY) {
        return `📋 Resumen semanal para ${userName}: ✅ ${completedCount} completado(s), ⏳ ${pendingCount} pendiente(s). ¡Buen trabajo esta semana!`;
    }

    const pendingList = pendingTitles.slice(0, 5).map((t, i) => `${i + 1}. ${t}`).join('\n');
    const prompt = `Eres Ping, el asistente de productividad personal de ${userName}. Es viernes por la noche.
Escribe un mensaje de resumen semanal muy corto y motivador (máx 5 oraciones) en español chileno.
Datos de la semana:
- Compromisos completados: ${completedCount}
- Compromisos pendientes: ${pendingCount}
${pendingCount > 0 ? `Los pendientes son:\n${pendingList}` : ''}

Tono: cálido, honesto, motivador. Celebra los logros. Si hay pendientes, anímalos a la próxima semana. No uses markdown, solo texto plano con emojis.`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8,
            max_tokens: 250,
        });
        return response.choices[0]?.message?.content || `📋 Semana cerrada, ${userName}. ✅ ${completedCount} logros esta semana. ¡Hasta el lunes!`;
    } catch (err) {
        console.error('[Synthesis Service] Weekly review failed:', err);
        return `📋 ¡Hola ${userName}! Esta semana: ✅ ${completedCount} completado(s), ⏳ ${pendingCount} pendiente(s). ¡Tú puedes la próxima semana! 🚀`;
    }
};

/**
 * Generates a high-level briefing with proactive actions.
 */
export const generateBriefing = async (
    userId: string,
    commitments: any[],
    ghostedChats: any[]
): Promise<{ title: string, summary: string, priority_commitment: any, suggestions: any[] }> => {
    if (!process.env.OPENAI_API_KEY) {
        return {
            title: "Tu Resumen Inteligente",
            summary: "No tengo acceso a la IA para generar un resumen personalizado.",
            priority_commitment: commitments[0] || null,
            suggestions: []
        };
    }

    const commitmentsText = commitments.length > 0
        ? commitments.slice(0, 5).map(c => `- [ID:${c.id}] ${c.title} (${c.status})`).join('\n')
        : 'Sin tareas pendientes próximamente.';

    const ghostedText = ghostedChats.length > 0
        ? ghostedChats.slice(0, 3).map(g => `- [CHAT_ID:${g.id}] Chat con ${g.name} (${g.hours}h sin respuesta)`).join('\n')
        : 'Sin conversaciones estancadas.';

    const prompt = `Eres Ping, un asistente de productividad nivel mundial. Genera un resumen ejecutivo de 2-3 frases y sugiere 2 acciones proactivas.

Contexto del Usuario:
COMPROMISOS:
${commitmentsText}

CONVERSACIONES EN ESPERA (Ghosted):
${ghostedText}

Instrucciones:
1. El "summary" debe ser motivador, directo y en español chileno cálido.
2. Genera 2 "suggestions" (objetos) con:
   - label: Texto corto del botón (ej: "Llamar a Carlos", "Terminar Reporte").
   - type: Uno de ["OPEN_CHAT", "COMPLETE_TASK", "CREATE_NOTE"].
   - payload: { id: "el ID o CHAT_ID correspondiente" }.

Responde SOLO en JSON:
{
  "summary": "...",
  "suggestions": [ { "label": "...", "type": "...", "payload": { "id": "..." } } ]
}`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.7,
            max_tokens: 400,
            response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        return {
            title: "Tu Resumen Inteligente",
            summary: parsed.summary || "¡Hola! Revisa tus pendientes para hoy.",
            priority_commitment: commitments[0] || null,
            suggestions: (parsed.suggestions || []).map((s: any, idx: number) => ({
                id: `sug-${idx}`,
                ...s
            }))
        };
    } catch (err) {
        console.error('[Synthesis Service] Briefing failed:', err);
        return {
            title: "Tu Resumen Inteligente",
            summary: "Hubo un pequeño error al generar tu resumen, pero tus datos están aquí.",
            priority_commitment: commitments[0] || null,
            suggestions: []
        };
    }
};

/**
 * Analyzes if a message is actionable.
 */
export const analyzeActionability = async (text: string): Promise<{ isActionable: boolean, reason: string }> => {
    if (!process.env.OPENAI_API_KEY || !text || text.trim().length < 5) {
        return { isActionable: false, reason: 'Texto muy corto o sin API key' };
    }

    const prompt = `Analiza si el siguiente mensaje de chat requiere una respuesta, acción o seguimiento por parte del receptor.
Responde únicamente con un JSON: { "isActionable": boolean, "reason": "breve explicación en español" }

Mensaje: "${text}"`;

    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            max_tokens: 150,
            response_format: { type: 'json_object' },
        });

        const parsed = JSON.parse(response.choices[0]?.message?.content || '{}');
        return {
            isActionable: !!parsed.isActionable,
            reason: parsed.reason || ''
        };
    } catch (err) {
        console.error('[Synthesis Service] Actionability analysis failed:', err);
        return { isActionable: false, reason: 'Error en la IA' };
    }
};

/**
 * Main chat logic for "Ping" assistant.
 */
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
        console.error('[Synthesis Service] askPing failed:', err);
        return 'Hubo un error al consultar a la IA.';
    }
};
