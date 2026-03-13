import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { insertSystemMessage } from './message.service';
import { NotificationService } from './notification.service';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
        console.error('[Commitment Service] extractCommitment failed:', err);
        return { hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null };
    }
};

export const createCommitment = async (userId: string, data: any) => {
    const { 
        title, 
        due_at, 
        message_id, 
        assigned_to_user_id, 
        group_conversation_id, 
        is_group_task = false,
        meta = {} 
    } = data;

    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .insert({
            title,
            due_at,
            message_id,
            owner_user_id: userId,
            assigned_to_user_id: assigned_to_user_id || userId,
            group_conversation_id,
            is_group_task,
            status: assigned_to_user_id && assigned_to_user_id !== userId ? 'pending' : 'accepted',
            meta
        })
        .select()
        .single();

    if (error) throw error;

    // Notify to Chat if conversationId is present
    if (group_conversation_id) {
        const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('full_name')
            .eq('id', userId)
            .single();
        
        const senderName = profile?.full_name || 'Alguien';
        let sysText = `✨ ${senderName} agendó: ${title}`;
        if (assigned_to_user_id && assigned_to_user_id !== userId) {
            const { data: target } = await supabaseAdmin.from('profiles').select('full_name').eq('id', assigned_to_user_id).single();
            sysText = `✨ ${senderName} propuso agendar "${title}" para ${target?.full_name || 'otro usuario'}`;
        }

        await insertSystemMessage(group_conversation_id, sysText, userId);
    }

    return commitment;
};

export const acceptCommitment = async (userId: string, id: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ status: 'accepted' })
        .eq('id', id)
        .eq('assigned_to_user_id', userId)
        .select()
        .single();

    if (error) throw error;
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
        .eq('assigned_to_user_id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const postponeCommitment = async (userId: string, id: string, newDate: string) => {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ 
            due_at: newDate,
            status: 'pending',
            meta: { original_due_at: newDate } // Placeholder
        })
        .eq('id', id)
        .eq('assigned_to_user_id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const getCommitments = async (userId: string, status?: string, conversationId?: string) => {
    let query = supabaseAdmin
        .from('commitments')
        .select('*');

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
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update(updates)
        .eq('id', id)
        .or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`)
        .select()
        .single();

    if (error) throw error;
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
