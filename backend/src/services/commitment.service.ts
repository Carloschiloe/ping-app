import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { NotificationService } from './notification.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { assertCommitmentConversationParticipant, assertCommitmentOwner, assertCommitmentOwnerOrResponsible, assertConversationParticipant, assertOwnContact } from '../utils/authz';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { isTitleMeeting } from '../utils/commitmentType';
import { AppError } from '../utils/AppError';
import {
    computeCommitmentTransition,
    CommitmentStateSnapshot,
    CommitmentTransitionAction,
} from '../utils/commitmentTransitions';
import { recordCommitmentEvent } from '../utils/commitmentEvents';
import { readLegacyConversationId, readLegacyAssignedToUserId, readLegacyDueAt } from '../utils/commitmentCompat';
export { createConfirmedCommitment as createCommitment } from './commitmentProposal.service';

// Lazy: evita instanciar el cliente (y que reviente por falta de API key) en
// entornos donde este modulo se importa solo por sus funciones de
// commitments (tests, scripts), sin necesidad real de llamar a OpenAI.
let openai: OpenAI | null = null;
function getOpenAiClient(): OpenAI {
    if (!openai) {
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

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
- replyText (string | null): Texto para el botón de acción UI. Cuando exista una fecha, devuelve siempre "Agendar".
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
- El replyText debe ser SOLO "Agendar", sin "Entendido", tipo de compromiso ni saludos.
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

        const response = await getOpenAiClient().chat.completions.create({
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

// V2: createCommitment acepta la entrada minima necesaria para IA-confirmada
// y para el mobile actual (ver commitmentCompat.ts para los alias de
// entrada). Escribe unicamente columnas reales V2: conversation_id (nunca
// group_conversation_id), sin is_group_task (derivado en la respuesta, no
// persistido), status siempre uno de los 6 valores canonicos.
const createCommitmentLegacy = async (userId: string, data: any) => {
    console.log('[Commitment Service] Creating commitment');

    const title = data.title;
    const due_at = readLegacyDueAt(data);
    const message_id = data.message_id || data.messageId || null;
    const assigned_to_user_id = readLegacyAssignedToUserId(data);
    const counterparty_contact_id = data.counterparty_contact_id || data.counterpartyContactId || null;
    const conversation_id = readLegacyConversationId(data);
    const type = data.type || 'task';
    const priority = data.priority || null;
    const description = data.description || null;
    const expected_result = data.expected_result || data.expectedResult || null;
    const next_action = data.next_action || data.nextAction || null;
    const meta = data.meta || {};

    if (assigned_to_user_id && counterparty_contact_id) {
        throw new AppError('assigned_to_user_id and counterparty_contact_id are mutually exclusive', 400);
    }

    if (counterparty_contact_id) {
        await assertOwnContact(userId, counterparty_contact_id);
    }

    const isSelfAssigned = assigned_to_user_id === userId;
    const initialStatus = (!assigned_to_user_id || !isSelfAssigned) ? 'proposed' : 'accepted';
    const waitingOnUserId = initialStatus === 'proposed' ? assigned_to_user_id : null;
    const waitingOnContactId = initialStatus === 'proposed' ? counterparty_contact_id : null;

    const { data: commitment, error } = await supabaseAdmin
        .from('commitments')
        .insert({
            title,
            description,
            due_at,
            message_id,
            owner_user_id: userId,
            assigned_to_user_id,
            counterparty_contact_id,
            conversation_id,
            type,
            priority,
            expected_result,
            next_action,
            status: initialStatus,
            waiting_on_user_id: waitingOnUserId,
            waiting_on_contact_id: waitingOnContactId,
            meta,
        })
        .select('id, title, due_at, owner_user_id, assigned_to_user_id, counterparty_contact_id, conversation_id, type, status')
        .single();

    if (error) {
        console.error('[Commitment Service] INSERT commitments failed:', error);
        throw error;
    }

    await recordCommitmentEvent({
        commitmentId: commitment.id,
        actorUserId: userId,
        eventType: 'created',
        previousStatus: null,
        newStatus: initialStatus,
        payload: { conversationId: conversation_id, hasMessage: !!message_id, hasDueDate: !!due_at, assignedToUserId: assigned_to_user_id, counterpartyContactId: counterparty_contact_id },
    });

    // Notify to Chat if conversationId is present
    if (conversation_id) {
        try {
            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('full_name')
                .eq('id', userId)
                .single();

            const senderName = profile?.full_name || 'Alguien';
            const finalType = (type === 'meeting' || isTitleMeeting(title)) ? 'reunión' : 'tarea';

            let sysText: string;
            if (due_at) {
                const dateObj = new Date(due_at);
                const timeStr = dateObj.toLocaleString('es-CL', {
                    timeZone: 'America/Santiago',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                });
                sysText = `✨ ${senderName} agendó una ${finalType} para las ${timeStr}: ${title}`;
                if (assigned_to_user_id && assigned_to_user_id !== userId) {
                    sysText = `✨ ${senderName} propuso una nueva ${finalType} para las ${timeStr}: ${title}`;
                }
            } else {
                sysText = `✨ ${senderName} agregó una ${finalType} sin fecha: ${title}`;
            }

            console.log('[Commitment Service] Inserting system message:', sysText);
            // V2: messages usa content/metadata + system_event_type (no text/meta/user_id).
            const { data: systemMessage, error: msgError } = await supabaseAdmin
                .from('messages')
                .insert({
                    conversation_id,
                    sender_id: userId,
                    content: sysText,
                    metadata: { isSystem: true },
                    system_event_type: 'commitment_created',
                    status: 'sent'
                })
                .select('id')
                .single();

            if (msgError) {
                console.error('[Commitment Service] System message insert FAILED:', msgError);
            } else {
                console.log('[Commitment Service] System message inserted successfully');
                if (!message_id && systemMessage?.id) {
                    await supabaseAdmin
                        .from('commitments')
                        .update({ message_id: systemMessage.id })
                        .eq('id', commitment.id);
                }
            }
        } catch (innerErr) {
            console.error('[Commitment Service] Error in notification logic:', innerErr);
        }
    }

    if (assigned_to_user_id && assigned_to_user_id !== userId) {
        const senderName = await getUserName(userId);
        const when = due_at
            ? new Date(due_at).toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            })
            : 'sin fecha';

        await notifyUser(
            assigned_to_user_id,
            'Nueva tarea para ti',
            `${senderName} te asigno "${title}" para ${when}`,
            { type: 'commitment_assigned', commitmentId: commitment.id, conversationId: conversation_id }
        );
    }

    return commitment;
};

async function insertSystemMessage(userId: string, conversationId: string | null, text: string) {
    if (!conversationId) {
        console.warn(`[Commitment Service] insertSystemMessage: No conversationId provided for user ${userId}`);
        return;
    }
    try {
        console.info(`[Commitment Service] Inserting a system message into conversation ${conversationId}`);
        // V2: messages usa content/metadata + system_event_type (no text/meta/user_id).
        const { error } = await supabaseAdmin.from('messages').insert({
            conversation_id: conversationId,
            sender_id: userId,
            content: text,
            metadata: { isSystem: true },
            system_event_type: 'commitment_notice',
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

async function getPushProfile(userId?: string | null) {
    if (!userId) return null;

    const { data } = await supabaseAdmin
        .from('profiles')
        .select('full_name, expo_push_token')
        .eq('id', userId)
        .maybeSingle();

    return data || null;
}

async function notifyUser(userId: string | null | undefined, title: string, body: string, data: any = {}) {
    const profile = await getPushProfile(userId);
    if (!profile?.expo_push_token) return;

    await NotificationService.sendPushNotifications({
        to: profile.expo_push_token,
        title,
        body,
        data,
        sound: 'default',
    });
}

// ---------------------------------------------------------------------------
// Ciclo de vida: todas las transiciones de status pasan por
// commitmentTransitions.ts (computeCommitmentTransition). Este bloque solo
// hace I/O: trae el snapshot actual, delega la decision pura, aplica el
// patch, y registra el evento SOLO despues de que el update se confirmo.
// ---------------------------------------------------------------------------

async function fetchCommitmentSnapshot(id: string): Promise<CommitmentStateSnapshot> {
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .select('id, status, owner_user_id, assigned_to_user_id, counterparty_contact_id, due_at, proposed_due_at')
        .eq('id', id)
        .single();

    if (error) throw error;

    return {
        id: data.id,
        status: normalizeCommitmentStatus(data.status),
        ownerUserId: data.owner_user_id,
        assignedToUserId: data.assigned_to_user_id,
        counterpartyContactId: data.counterparty_contact_id,
        dueAt: data.due_at,
        proposedDueAt: data.proposed_due_at,
    };
}

const SELECT_AFTER_TRANSITION = 'id, title, due_at, proposed_due_at, status, owner_user_id, assigned_to_user_id, counterparty_contact_id, conversation_id, meta, rejection_reason, resolved_at, resolution_result, archived_at, action_completed_at, next_action, follow_up_at, waiting_on_user_id, waiting_on_contact_id';

async function applyCommitmentTransition(
    userId: string,
    id: string,
    action: CommitmentTransitionAction,
    extra: Partial<{ reason: string | null; newProposedDueAt: string | null; newAssignedToUserId: string | null; newCounterpartyContactId: string | null; followUpAt: string | null; nextAction: string | null; waitingOnUserId: string | null; waitingOnContactId: string | null; resolutionResult: string | null }> = {}
) {
    await assertCommitmentConversationParticipant(userId, id);
    const snapshot = await fetchCommitmentSnapshot(id);

    if (extra.newCounterpartyContactId) {
        await assertOwnContact(userId, extra.newCounterpartyContactId);
    }

    const { patch, event } = computeCommitmentTransition({
        action,
        actorUserId: userId,
        commitment: snapshot,
        ...extra,
    });
    if (action === 'resolve') {
        const resolutionResult = extra.resolutionResult?.trim();
        if (!resolutionResult) {
            throw new AppError('A comprehensible resolution result is required', 400);
        }
        patch.resolution_result = resolutionResult;
    }

    const { data, error } = await supabaseAdmin.rpc('apply_commitment_transition_with_evidence', {
        p_commitment_id: id,
        p_actor_user_id: userId,
        p_expected_status: snapshot.status,
        p_patch: patch,
        p_event_type: event.event_type,
        p_event_payload: event.payload,
    });

    if (error) {
        console.error(`[Commitment Service] ${action} update error:`, error);
        throw error;
    }

    return data;
}

export const acceptCommitment = async (userId: string, id: string) => {
    console.log(`[Commitment Service] acceptCommitment: userId=${userId}, commitmentId=${id}`);
    const data = await applyCommitmentTransition(userId, id, 'accept');

    console.log(`[Commitment Service] Commitment updated to accepted: ${data.id}`);
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `✅ ${userName} aceptó la propuesta: "${data.title}"`);
    if (data.owner_user_id && data.owner_user_id !== userId) {
        await notifyUser(
            data.owner_user_id,
            'Tarea aceptada',
            `${userName} acepto "${data.title}"`,
            { type: 'commitment_accepted', commitmentId: data.id, conversationId: data.conversation_id }
        );
    }

    return data;
};

export const rejectCommitment = async (userId: string, id: string, reason?: string | null) => {
    const data = await applyCommitmentTransition(userId, id, 'reject', { reason: reason ?? null });

    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `❌ ${userName} rechazó la propuesta: "${data.title}"${reason ? ` (Motivo: ${reason})` : ''}`);
    if (data.owner_user_id && data.owner_user_id !== userId) {
        await notifyUser(
            data.owner_user_id,
            'Tarea rechazada',
            `${userName} rechazo "${data.title}"`,
            { type: 'commitment_rejected', commitmentId: data.id, conversationId: data.conversation_id }
        );
    }

    return data;
};

// V2: escribe proposed_due_at (columna real), nunca due_at directamente.
// due_at solo se actualiza cuando la contrapropuesta es aceptada (ver
// commitmentTransitions.ts:computeAccept).
export const counterProposeCommitment = async (userId: string, id: string, proposedDueAt: string) => {
    const data = await applyCommitmentTransition(userId, id, 'counter_propose', { newProposedDueAt: proposedDueAt });

    const userName = await getUserName(userId);
    const newDateStr = format(new Date(proposedDueAt), "eeee d 'de' MMMM 'a las' HH:mm", { locale: es });
    await insertSystemMessage(userId, data.conversation_id, `🕒 ${userName} propuso una nueva fecha para "${data.title}": ${newDateStr}`);

    return data;
};

// Alias de compatibilidad temporal: mobile (usePostponeCommitment) sigue
// llamando POST /commitments/:id/postpone con { newDate }. Misma logica que
// counterProposeCommitment.
export const postponeCommitment = async (userId: string, id: string, newDate: string) => {
    return counterProposeCommitment(userId, id, newDate);
};

export const markActionCompleted = async (userId: string, id: string) => {
    const data = await applyCommitmentTransition(userId, id, 'action_complete');
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `☑️ ${userName} marcó la acción como realizada: "${data.title}"`);
    return data;
};

export const resolveCommitment = async (userId: string, id: string, resolutionResult: string) => {
    const data = await applyCommitmentTransition(userId, id, 'resolve', { resolutionResult });
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `✅ ${userName} marcó como resuelto: "${data.title}"`);
    return data;
};

export const cancelCommitment = async (userId: string, id: string) => {
    const data = await applyCommitmentTransition(userId, id, 'cancel');
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `🚫 ${userName} canceló: "${data.title}"`);
    return data;
};

export const reopenCommitment = async (userId: string, id: string) => {
    const data = await applyCommitmentTransition(userId, id, 'reopen');
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `🔄 ${userName} reabrió: "${data.title}"`);
    return data;
};

export const reassignCommitment = async (userId: string, id: string, newAssignedToUserId?: string | null, newCounterpartyContactId?: string | null) => {
    const data = await applyCommitmentTransition(userId, id, 'reassign', {
        newAssignedToUserId: newAssignedToUserId ?? null,
        newCounterpartyContactId: newCounterpartyContactId ?? null,
    });
    const userName = await getUserName(userId);
    await insertSystemMessage(userId, data.conversation_id, `👤 ${userName} reasignó: "${data.title}"`);
    return data;
};

export const scheduleFollowUp = async (
    userId: string,
    id: string,
    followUpAt: string,
    nextAction?: string | null,
    waitingOnUserId?: string | null,
    waitingOnContactId?: string | null
) => {
    return applyCommitmentTransition(userId, id, 'schedule_follow_up', {
        followUpAt,
        nextAction,
        waitingOnUserId,
        waitingOnContactId,
    });
};

// Traduce un status legacy/V2 recibido por el PATCH generico a una accion de
// la maquina de estados. Devuelve null si el status pedido ya es el actual
// (no-op, no dispara transicion). Nunca escribe un valor legacy a la
// columna: siempre pasa por normalizeCommitmentStatus primero.
function mapRequestedStatusToAction(requestedStatus: string, currentStatus: string): CommitmentTransitionAction | null {
    const normalized = normalizeCommitmentStatus(requestedStatus);
    if (normalized === currentStatus) return null;

    switch (normalized) {
        case 'accepted': return 'accept';
        case 'rejected': return 'reject';
        case 'resolved':
            throw new AppError('Use POST /commitments/:id/resolve with a resolution result', 400);
        case 'cancelled': return 'cancel';
        default:
            throw new AppError(
                `Cannot set status to "${normalized}" via PATCH /commitments/:id. Use a dedicated endpoint (/counter-propose, /reopen).`,
                400
            );
    }
}

// V2: PATCH generico. Compatibilidad temporal con mobile: mobile todavia
// envia `status: 'completed'` (useMarkCommitmentDone, operation.ts) en vez
// de llamar a un endpoint dedicado — se traduce aqui a la transicion real
// `resolve`, nunca se escribe 'completed' a la base.
export const updateCommitment = async (userId: string, id: string, updates: any) => {
    await assertCommitmentOwner(userId, id);

    const safeFieldUpdates: Record<string, any> = {};
    if (updates.title !== undefined) safeFieldUpdates.title = updates.title;
    if (updates.description !== undefined) safeFieldUpdates.description = updates.description;
    if (updates.due_at !== undefined) safeFieldUpdates.due_at = updates.due_at;
    if (updates.type !== undefined) safeFieldUpdates.type = updates.type;
    if (updates.priority !== undefined) safeFieldUpdates.priority = updates.priority;
    if (updates.expected_result !== undefined) safeFieldUpdates.expected_result = updates.expected_result;

    let statusAction: CommitmentTransitionAction | null = null;
    let snapshot: CommitmentStateSnapshot | null = null;

    if (updates.status !== undefined && updates.status !== null) {
        snapshot = await fetchCommitmentSnapshot(id);
        statusAction = mapRequestedStatusToAction(updates.status, snapshot.status);
    }

    let data: any;
    let transitionEvent: ReturnType<typeof computeCommitmentTransition>['event'] | null = null;

    if (statusAction) {
        if (!snapshot) snapshot = await fetchCommitmentSnapshot(id);
        const { patch, event } = computeCommitmentTransition({ action: statusAction, actorUserId: userId, commitment: snapshot });
        transitionEvent = event;
        Object.assign(safeFieldUpdates, patch);
    }

    const { data: oldCommitment } = await supabaseAdmin
        .from('commitments')
        .select('id, title, due_at, assigned_to_user_id, conversation_id, type')
        .eq('id', id)
        .single();

    const result = await supabaseAdmin
        .from('commitments')
        .update(safeFieldUpdates)
        .eq('id', id)
        .select(SELECT_AFTER_TRANSITION)
        .single();

    if (result.error) throw result.error;
    data = result.data;

    if (transitionEvent) {
        await recordCommitmentEvent({
            commitmentId: id,
            actorUserId: userId,
            eventType: transitionEvent.event_type,
            previousStatus: transitionEvent.previous_status,
            newStatus: transitionEvent.new_status,
            payload: transitionEvent.payload,
        });
    } else if (updates.due_at !== undefined && updates.due_at !== oldCommitment?.due_at) {
        // Reprogramacion directa (no negociada) de un compromiso ya
        // aceptado: distinto de counter_propose, se registra como
        // 'rescheduled'.
        await recordCommitmentEvent({
            commitmentId: id,
            actorUserId: userId,
            eventType: 'rescheduled',
            previousStatus: snapshot?.status ?? null,
            newStatus: snapshot?.status ?? null,
            payload: { previousDueAt: oldCommitment?.due_at ?? null, newDueAt: updates.due_at },
        });
    }

    if (data && (updates.title !== undefined || updates.due_at !== undefined)) {
        const titleChanged = updates.title !== undefined && updates.title !== oldCommitment?.title;
        const dueAtChanged = updates.due_at !== undefined && updates.due_at !== oldCommitment?.due_at;
        const notices: string[] = [];

        if (titleChanged) {
            notices.push(`Título actualizado: ${data.title}`);
        }
        if (dueAtChanged) {
            const dateObj = new Date(data.due_at);
            const dateStr = dateObj.toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            });
            notices.push(`Nuevo horario: ${dateStr}`);
        }

        if (notices.length > 0) {
            await insertSystemMessage(userId, data.conversation_id, `✏️ ${notices.join(' · ')}`);
        }
    }

    return data;
};

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

export const getCommitments = async (userId: string, status?: string, conversationId?: string, isGroupTask?: boolean) => {
    if (conversationId) {
        await assertConversationParticipant(userId, conversationId);
    }

    let query = supabaseAdmin
        .from('commitments')
        .select(`
            id,
            title,
            description,
            due_at,
            proposed_due_at,
            status,
            type,
            priority,
            expected_result,
            next_action,
            follow_up_at,
            waiting_on_user_id,
            waiting_on_contact_id,
            rejection_reason,
            action_completed_at,
            resolved_at,
            resolution_result,
            archived_at,
            meta,
            owner_user_id,
            assigned_to_user_id,
            counterparty_contact_id,
            conversation_id,
            message_id,
            created_at,
            owner:owner_user_id(id, full_name, email, avatar_url),
            assignee:assigned_to_user_id(id, full_name, email, avatar_url)
        `);

    if (conversationId) {
        query = query.eq('conversation_id', conversationId);
    } else {
        query = query.or(`owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`);
    }
    query = query.is('archived_at', null);

    if (status) {
        // Interpreta el filtro solicitado (puede venir en formato legacy de
        // un cliente no adaptado) y filtra por el UNICO valor canonico
        // resultante — nunca por una lista de valores legacy, porque V2
        // nunca persiste valores legacy.
        query = query.eq('status', normalizeCommitmentStatus(status));
    }

    if (isGroupTask === true) {
        query = query.is('assigned_to_user_id', null).not('conversation_id', 'is', null);
    } else if (isGroupTask === false) {
        query = query.not('assigned_to_user_id', 'is', null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
};

export const deleteCommitment = async (userId: string, id: string) => {
    await assertCommitmentOwner(userId, id);
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .eq('owner_user_id', userId)
        .select()
        .single();

    if (error) throw error;
    return data;
};

export const pingCommitment = async (userId: string, id: string) => {
    await assertCommitmentOwnerOrResponsible(userId, id);

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
        .in('status', ['proposed', 'accepted', 'counter_proposal'])
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
