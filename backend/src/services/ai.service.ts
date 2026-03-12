import OpenAI from 'openai';
import fs from 'fs';
import { supabaseAdmin } from '../lib/supabaseAdmin';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

console.log('--- [DEBUG] AI SERVICE LOADED (VERSION 2.1 - NO AUTO-CONFIRM) ---');

export interface CommitmentExtraction {
    hasCommitment: boolean;
    title: string | null;
    dueAt: string | null;       // ISO 8601 string or null
    replyText: string | null;   // confirmation message for the user
    assignedToName: string | null; // Phase 26: name of the person responsible (if mentioned)
}

const SYSTEM_PROMPT = `Eres un asistente de productividad personal en español (Chile). Analizas mensajes de chat e identificas si el mensaje contiene un compromiso, tarea, recordatorio o evento con fecha/hora.

Extrae la siguiente información en JSON:
- hasCommitment (boolean): true si hay un compromiso, tarea o evento con fecha/hora implícita o explícita
- title (string | null): título corto y claro del compromiso (máx 60 caracteres)
- dueAt (string | null): fecha y hora en formato ISO 8601 (ej: 2026-03-05T15:00:00), calculada desde la fecha de hoy
- replyText (string | null): Texto para el botón de acción UI. Debe ser muy corto y directo (ej: "Agendar reunión", "Guardar recordatorio", "Asignar tarea"). MÁXIMO 3 palabras.
- assignedToName (string | null): nombre o mención de la persona responsable. PRIORIZA menciones que empiecen con @ (ej: "@Carlos", devolver "Carlos"). Si no hay @mención, busca nombres en el texto. Si es para el emisor o no hay claridad, devuelve null.

Reglas:
- Si el mensaje es solo una imagen sin texto ni @mención clara, devuelve hasCommitment: false a menos que la imagen sea EXPLÍCITAMENTE una tarea (ej: una lista de pendientes escrita en papel).
- Si no hay compromiso claro, devuelve hasCommitment: false y null en los demás campos  
- "mañana" = día siguiente al enviado.
- Si no hay hora, usa 09:00.
- El replyText debe ser SOLO el texto para el botón UI, sin "Entendido" ni saludos.
- Interpreta lenguaje natural chileno.
- Usa el contexto completo del mensaje para entender compromisos implícitos

Responde SOLO con JSON válido.`;

export const extractCommitment = async (
    text: string,
    nowIso: string,
    imageUrl?: string
): Promise<CommitmentExtraction> => {
    if (!process.env.OPENAI_API_KEY) {
        return { hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null };
    }

    try {
        const userContent: any[] = [{ type: 'text', text: `Fecha y hora actual: ${nowIso}\n\nMensaje: "${text}"` }];

        if (imageUrl) {
            userContent.push({
                type: 'image_url',
                image_url: { url: imageUrl }
            });
        }

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT },
                { role: 'user', content: userContent }
            ],
            temperature: 0.1,
            max_tokens: 300,
            response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(raw);
        return {
            hasCommitment: !!parsed.hasCommitment,
            title: parsed.title || null,
            dueAt: parsed.dueAt || null,
            replyText: parsed.replyText || null,
            assignedToName: parsed.assignedToName || null,
        };
    } catch (err) {
        console.error('[AI] extractCommitment failed:', err);
        return { hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null };
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

/**
 * Phase 27: Generates the Weekly Review message for Friday evening.
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
        console.error('[AI] generateWeeklyReview failed:', err);
        return `📋 ¡Hola ${userName}! Esta semana: ✅ ${completedCount} completado(s), ⏳ ${pendingCount} pendiente(s). ¡Tú puedes la próxima semana! 🚀`;
    }
};
/**
 * Phase 28: Analyzes if a message is actionable or requires follow-up.
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
        console.error('[AI] analyzeActionability failed:', err);
        return { isActionable: false, reason: 'Error en la IA' };
    }
};
/**
 * Phase 28: Generates a high-level briefing with proactive actions.
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
        console.error('[AI] generateBriefing failed:', err);
        return {
            title: "Tu Resumen Inteligente",
            summary: "Hubo un pequeño error al generar tu resumen, pero tus datos están aquí.",
            priority_commitment: commitments[0] || null,
            suggestions: []
        };
    }
};
/**
 * Phase 29: Post-Call Processing
 * Transcription with Whisper + Synthesis with GPT-4o
 */
export const processCallRecording = async (callId: string): Promise<void> => {
    try {
        console.log(`[AI] Starting post-call processing for: ${callId}`);

        // 1. Get call details
        const { data: call, error: fetchErr } = await supabaseAdmin
            .from('calls')
            .select('*')
            .eq('id', callId)
            .single();

        if (fetchErr || !call) throw new Error('Call not found');

        // 2. Wait for Agora to finish uploading (polling would be better, but a delay is a start)
        console.log(`[AI] Waiting 15s for recording upload to storage...`);
        await new Promise(resolve => setTimeout(resolve, 15000));

        // 3. Locate recording in Storage
        // Agora HLS/Mix mode usually creates an .m3u8 and .ts segments, or an MP4 if configured.
        // For simplicity, we'll try to find the most recent audio/video file in the bucket for this channel.
        const channelName = (call.meta?.channelName || call.conversation_id).replace(/-/g, '');
        const prefix = `calls/${channelName}`;
        
        console.log(`[AI] Searching for recording in bucket: ${prefix}`);
        const { data: files, error: listErr } = await supabaseAdmin.storage
            .from('recordings')
            .list(prefix, { sortBy: { column: 'created_at', order: 'desc' }, limit: 5 });

        if (listErr || !files || files.length === 0) {
            console.error('[AI] No recording files found in storage.');
            await supabaseAdmin.from('calls').update({ status: 'no_recording' }).eq('id', callId);
            return;
        }

        // Find the first .aac, .m4a or .mp4 file (mixer usually outputs these or .ts)
        // Note: For Whisper we'd ideally have a single audio file. 
        // Agora Mix mode HLS output is harder to transcribe directly without concatenation.
        // We'll assume for now that if we find a file, we attempt to transcribe it.
        const recordingFile = files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.m4a') || f.name.endsWith('.ts'));
        if (!recordingFile) {
            console.error('[AI] Could not find a suitable audio/video file for transcription.');
            return;
        }

        const fullPath = `${prefix}/${recordingFile.name}`;
        console.log(`[AI] Downloading file for transcription: ${fullPath}`);
        
        const { data: fileBlob, error: downloadErr } = await supabaseAdmin.storage
            .from('recordings')
            .download(fullPath);

        if (downloadErr || !fileBlob) throw new Error(`Download failed: ${downloadErr?.message}`);

        // Write to tmp file for Whisper
        const tmpPath = `/tmp/${callId}_${recordingFile.name}`;
        const buffer = Buffer.from(await fileBlob.arrayBuffer());
        fs.writeFileSync(tmpPath, buffer);

        // 4. Transcribe with Whisper
        console.log(`[AI] Transcribing with Whisper...`);
        const transcript = await transcribeAudio(tmpPath);
        fs.unlinkSync(tmpPath); // Cleanup

        if (!transcript) {
            console.error('[AI] Transcription returned empty.');
            return;
        }

        // 5. Summarize and Extract Commitments
        console.log(`[AI] Summarizing and extracting commitments...`);
        const nowIso = new Date().toISOString();
        const summaryPrompt = `Analiza esta transcripción de una llamada de voz/video y genera un resumen ejecutivo.
Identifica también cualquier compromiso o tarea acordada.

Transcripción:
"${transcript}"`;

        const summaryResponse = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: summaryPrompt }],
            temperature: 0.3,
        });

        const summary = summaryResponse.choices[0]?.message?.content || 'Sin resumen.';

        // Also run the commitment extractor on the transcript
        const extraction = await extractCommitment(transcript, nowIso);

        // 6. Update Call Record
        await supabaseAdmin.from('calls').update({
            transcript,
            summary,
            status: 'processed'
        }).eq('id', callId);

        // 7. Post summary and task to the chat
        const summaryMessage = `📞 **Resumen de la llamada**\n\n${summary}`;
        const { data: msgData } = await supabaseAdmin.from('messages').insert({
            conversation_id: call.conversation_id,
            user_id: call.meta?.callerId, // Attribution to caller or system user?
            text: summaryMessage,
            meta: { is_ai_summary: true, callId }
        }).select().single();

        // If a commitment was found, create it too
        if (extraction.hasCommitment && msgData) {
            await supabaseAdmin.from('commitments').insert({
                title: extraction.title,
                due_at: extraction.dueAt,
                assigned_to_user_id: call.conversation_id, // Default to group or recipient? 
                // Note: Logic for who is assigned would need more context from transcript names.
                message_id: msgData.id,
                status: 'pending'
            });
        }

        console.log(`[AI] Call ${callId} processed and summary posted.`);

    } catch (err) {
        console.error('[AI] processCallRecording failed:', err);
    }
};
