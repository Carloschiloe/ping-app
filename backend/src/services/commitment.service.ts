import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { NotificationService } from './notification.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface CommitmentExtraction {
    hasCommitment: boolean;
    title: string | null;
    dueAt: string | null;       // ISO 8601 string or null
    replyText: string | null;   // confirmation message for the user
    assignedToName: string | null; // Phase 26: name of the person responsible (if mentioned)
    type: 'task' | 'meeting';      // Differentiation
}

const SYSTEM_PROMPT = `Eres un asistente de productividad personal en español (Chile). Analizas mensajes de chat e identificas si el mensaje contiene un compromiso, tarea, recordatorio o evento con fecha/hora.

Extrae la siguiente información en JSON:
- hasCommitment (boolean): true si hay un compromiso, tarea o evento con fecha/hora implícita o explícita
- title (string | null): título corto y claro del compromiso (máx 60 caracteres)
- dueAt (string | null): fecha y hora en formato ISO 8601 con offset (ej: 2026-03-05T15:00:00-03:00), calculada desde la fecha de hoy.
- replyText (string | null): Texto para el botón de acción UI. Debe ser muy corto y directo (ej: "Agendar reunión", "Guardar recordatorio", "Asignar tarea"). MÁXIMO 3 palabras.
- assignedToName (string | null): nombre o mención de la persona responsable. PRIORIZA menciones que empiecen con @ (ej: "@Carlos", devolver "Carlos"). Si no hay @mención, busca nombres en el texto. Si es para el emisor o no hay claridad, devuelve null.
- type (string): "meeting" si es una reunión, call, junta o evento con hora fija. "task" si es una acción a realizar, un favor o un pendiente.

Reglas:
- TIMEZONE: Estás en Chile. Usa UTC-3 para tus cálculos de hora.
- REUNIÓN (meeting): Se refiere a encontrarse con alguien, hablar por teléfono o Zoom, o un evento social/laboral. Si el mensaje dice "reunión" explícitamente, usa "meeting".
- TAREA (task): Se refiere a ejecutar una acción técnica, enviar un documento, comprar algo, etc.
- Si el mensaje es solo una imagen sin texto ni @mención clara, devuelve hasCommitment: false a menos que la imagen sea EXPLÍCITAMENTE una tarea (ej: una lista de pendientes escrita en papel).
- Si no hay compromiso claro, devuelve hasCommitment: false y null en los demás campos  
- "mañana" = día siguiente al enviado.
- Si no hay hora, usa 09:00:00-03:00.
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
        return { hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null, type: 'task' };
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
            type: parsed.type === 'meeting' ? 'meeting' : 'task',
        };
    } catch (err) {
        console.error('[Commitment Service] extractCommitment failed:', err);
        return { hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null, type: 'task' };
    }
};

export const createCommitment = async (userId: string, data: any) => {
    console.log('[Commitment Service] Creating commitment with data:', JSON.stringify(data));
    
    // Standardize field names (handle both camelCase from AI/Frontend and snake_case from schema)
    const title = data.title;
    const due_at = data.due_at || data.dueAt;
    const message_id = data.message_id || data.messageId;
    const assigned_to_user_id = data.assigned_to_user_id || data.assignedToUserId;
    const group_conversation_id = data.group_conversation_id || data.groupConversationId;
    const is_group_task = data.is_group_task || data.isGroupTask || false;
    const type = data.type || 'task';
    const meta = data.meta || {};

    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .insert({
            title,
            due_at,
            message_id,
            owner_user_id: userId,
            assigned_to_user_id: assigned_to_user_id,
            group_conversation_id,
            is_group_task,
            type,
            status: (assigned_to_user_id && assigned_to_user_id !== userId) || !assigned_to_user_id ? 'proposed' : 'accepted',
            meta
        })
        .select()
        .single();

    if (error) {
        console.error('[Commitment Service] INSERT commitments failed:', error);
        throw error;
    }

    // Notify to Chat if conversationId is present
    if (group_conversation_id) {
        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('full_name')
                .eq('id', userId)
                .single();
            
            const senderName = profile?.full_name || 'Alguien';
            // Robust check: include common meeting synonyms and handle accents/casing
            const isTitleMeeting = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(title || '');
            const finalType = (type === 'meeting' || isTitleMeeting) ? 'reunión' : 'tarea';
            
            const dateObj = new Date(due_at);
            const timeStr = dateObj.toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });

            let sysText = `✨ ${senderName} agendó una ${finalType} para las ${timeStr}: ${title}`;
            
            // If it's a proposal for someone else, use "propuso"
            if (assigned_to_user_id && assigned_to_user_id !== userId) {
                 sysText = `✨ ${senderName} propuso una nueva ${finalType} para las ${timeStr}: ${title}`;
            }

            console.log('[Commitment Service] Inserting system message:', sysText);
            const { error: msgError } = await supabaseAdmin.from('messages').insert({
                conversation_id: group_conversation_id,
                sender_id: userId,
                user_id: userId,
                text: sysText,
                meta: { isSystem: true },
                status: 'sent'
            });

            if (msgError) {
                console.error('[Commitment Service] System message insert FAILED:', msgError);
            } else {
                console.log('[Commitment Service] System message inserted successfully');
            }
        } catch (innerErr) {
            console.error('[Commitment Service] Error in notification logic:', innerErr);
        }
    }

    return commitment;
};

async function insertSystemMessage(userId: string, conversationId: string, text: string) {
    if (!conversationId) {
        console.warn(`[Commitment Service] insertSystemMessage: No conversationId provided for user ${userId}`);
        return;
    }
    try {
        console.log(`[Commitment Service] Inserting system message: "${text}" into conversation ${conversationId}`);
        const { error } = await supabaseAdmin.from('messages').insert({
            conversation_id: conversationId,
            sender_id: userId,
            user_id: userId,
            text,
            meta: { isSystem: true },
            status: 'sent'
        });
        if (error) {
            console.error('[Commitment Service] insertSystemMessage SQL error:', error);
        }
    } catch (err) {
        console.error('[Commitment Service] insertSystemMessage exception:', err);
    }
}

async function getUserName(userId: string) {
    const { data } = await supabaseAdmin.from('profiles').select('full_name').eq('id', userId).single();
    return data?.full_name || 'Alguien';
}

export const acceptCommitment = async (userId: string, id: string) => {
    console.log(`[Commitment Service] acceptCommitment: userId=${userId}, commitmentId=${id}`);
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ 
            status: 'accepted',
            assigned_to_user_id: userId
        })
        .eq('id', id)
        .or(`assigned_to_user_id.eq.${userId},assigned_to_user_id.is.null`)
        .select()
        .single();

    if (error) {
        console.error('[Commitment Service] acceptCommitment update error:', error);
        throw error;
    }

    console.log(`[Commitment Service] Commitment updated to accepted: ${data.id}`);
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.group_conversation_id, `✅ ${userName} aceptó la propuesta: "${data.title}"`);

    return data;
};

export const rejectCommitment = async (userId: string, id: string, reason?: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ 
            status: 'rejected',
            meta: { rejection_reason: reason } 
        })
        .eq('id', id)
        .or(`assigned_to_user_id.eq.${userId},assigned_to_user_id.is.null`)
        .select()
        .single();

    if (error) throw error;

    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.group_conversation_id, `❌ ${userName} rechazó la propuesta: "${data.title}"${reason ? ` (Motivo: ${reason})` : ''}`);

    return data;
};

export const postponeCommitment = async (userId: string, id: string, newDate: string) => {
    // Fetch current state to merge meta
    const { data: currentTask } = await supabaseAdmin.from('commitments').select('due_at, meta').eq('id', id).single();

    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ 
            due_at: newDate,
            status: 'proposed',
            meta: { ...(currentTask?.meta || {}), original_due_at: currentTask?.due_at } 
        })
        .eq('id', id)
        .or(`assigned_to_user_id.eq.${userId},assigned_to_user_id.is.null`)
        .select()
        .single();

    if (error) throw error;

    const userName = await getUserName(userId);
    const newDateStr = format(new Date(newDate), "eeee d 'de' MMMM 'a las' HH:mm", { locale: es });
    await insertSystemMessage(userId, data.group_conversation_id, `🕒 ${userName} pospuso la propuesta "${data.title}" para el ${newDateStr}`);

    return data;
};

export const getCommitments = async (userId: string, status?: string, conversationId?: string) => {
    let query = supabaseAdmin
        .from('commitments')
        .select(`
            *,
            owner:owner_user_id(id, full_name, email, avatar_url),
            assignee:assigned_to_user_id(id, full_name, email, avatar_url)
        `);

    if (conversationId) {
        query = query.eq('group_conversation_id', conversationId);
    } else {
        query = query.or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`);
    }

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw error;
    return data;
};

export const updateCommitment = async (userId: string, id: string, updates: any) => {
    // Fetch old record for message comparison
    const { data: oldCommitment } = await supabaseAdmin.from('commitments').select('*').eq('id', id).single();

    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update(updates)
        .eq('id', id)
        .or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
        .select()
        .single();

    if (error) throw error;

    if (data && (updates.title || updates.due_at || updates.assigned_to_user_id)) {
        const userName = await getUserName(userId);
        let detail = '';
        const isTitleMeeting = /reuni[oó]n|llamada|junta|meet|zoom|call|cita/i.test(updates.title || data.title || '');
        const finalType = (data.type === 'meeting' || isTitleMeeting) ? 'la reunión' : 'la tarea';
        
        let actionText = `editó ${finalType}`;
        if (updates.due_at) {
            actionText = `propuso un cambio de fecha/hora para ${finalType}`;
        }
        if (updates.due_at) {
            const dateObj = new Date(updates.due_at);
            const dateStr = dateObj.toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            detail = `: ${dateStr}`;
        }
        await insertSystemMessage(userId, data.group_conversation_id, `✏️ ${userName} ${actionText}${detail}`);
    }

    return data;
};

export const deleteCommitment = async (userId: string, id: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .delete()
        .eq('id', id)
        .eq('owner_user_id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const pingCommitment = async (userId: string, id: string) => {
    // Basic push reminder
    const { data: c } = await supabaseAdmin.from('commitments').select('*, profiles:assigned_to_user_id(expo_push_token, full_name)').eq('id', id).single();
    if (c?.profiles?.expo_push_token) {
        await NotificationService.sendPushNotifications({
            to: c.profiles.expo_push_token,
            title: '⏰ Recordatorio de compromiso',
            body: `Hola ${c.profiles.full_name}, tienes pendiente: ${c.title}`,
            data: { type: 'commitment_reminder', id }
        });
    }
    return { ok: true };
};

export const checkConflict = async (userId: string, dueAt: string, excludeId?: string) => {
    const checkDate = new Date(dueAt);
    if (isNaN(checkDate.getTime())) {
        console.warn('[Commitment Service] Invalid date received for checkConflict:', dueAt);
        return [];
    }
    const startRange = new Date(checkDate.getTime() - 30 * 60 * 1000).toISOString(); // -30 min
    const endRange = new Date(checkDate.getTime() + 30 * 60 * 1000).toISOString();   // +30 min

    let query = supabaseAdmin
        .from('commitments')
        .select('id, title, due_at, type')
        .eq('status', 'accepted')
        .or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
        .gte('due_at', startRange)
        .lte('due_at', endRange);

    if (excludeId) {
        query = query.neq('id', excludeId);
    }

    const { data: conflicts, error } = await query;

    if (error) {
        console.error('[Commitment Service] checkConflict failed:', error);
        return [];
    }
    return conflicts || [];
};
