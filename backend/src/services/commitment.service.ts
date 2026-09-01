import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { NotificationService } from './notification.service';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { assertCommitmentConversationParticipant, assertCommitmentOwner, assertCommitmentOwnerOrResponsible, assertConversationParticipant, assertOwnContact } from '../utils/authz';
import { normalizeCommitmentStatus } from '../utils/commitmentStatus';
import { AppError } from '../utils/AppError';
import {
    computeCommitmentTransition,
    CommitmentStateSnapshot,
    CommitmentTransitionAction,
} from '../utils/commitmentTransitions';
import {
    attachAgreementResponses,
    createConfirmedCommitment,
} from './commitmentProposal.service';
import {
    buildCommitmentVisibilityFilter,
    getParticipantProposalIds,
} from '../utils/commitmentVisibility';
import { persistSystemMessage } from './messagingApplication.service';
import { resolveTimeZone } from './date-parser.service';

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
- dueAt (string | null): fecha y hora en formato ISO 8601 con offset, calculada desde la fecha y zona horaria indicadas.
- replyText (string | null): Texto para el botón de acción UI. Cuando exista una fecha, devuelve siempre "Agendar".
- assignedToName (string | null): nombre o mención de la persona responsable. PRIORIZA menciones que empiecen con @ (ej: "@Carlos", devolver "Carlos"). Si no hay @mención, busca nombres en el texto. Si es para el emisor o no hay claridad, devuelve null.
- type (string): "meeting" si es una reunión, call, junta o evento con hora fija. "task" si es una acción a realizar, un favor o un pendiente.

Reglas:
- TIMEZONE: Usa la zona horaria IANA indicada en el mensaje y respeta automáticamente su horario estacional. Nunca asumas un offset UTC fijo.
- HORA EXPLÍCITA: Si el usuario dice 16:00, conserva 16:00 en su zona horaria. No la muevas aunque ya haya pasado.
- DÍAS EXPLÍCITOS: "próximo miércoles" debe caer en miércoles; nunca cambies el día de la semana indicado por el usuario.
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
    imageUrl?: string,
    requestedTimeZone?: string | null,
): Promise<CommitmentExtraction> => {
    if (!process.env.OPENAI_API_KEY) {
        return { hasCommitment: false, title: null, dueAt: null, replyText: null, assignedToName: null, type: 'task' };
    }

    try {
        const timeZone = resolveTimeZone(requestedTimeZone);
        const userContent: any[] = [{
            type: 'text',
            text: `Fecha y hora actual: ${nowIso}\nZona horaria del usuario: ${timeZone}\n\nMensaje: "${text}"`,
        }];

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

// Public compatibility adapter for scripts/callers that still import
// commitment.service.createCommitment. It no longer owns a direct INSERT:
// every callable path persists a Proposal and then confirms it explicitly.
export const createCommitment = createConfirmedCommitment;
async function insertSystemMessage(userId: string, conversationId: string | null, text: string) {
    if (!conversationId) {
        console.warn(`[Commitment Service] insertSystemMessage: No conversationId provided for user ${userId}`);
        return;
    }
    try {
        console.info(`[Commitment Service] Inserting a system message into conversation ${conversationId}`);
        // V2: messages usa content/metadata + system_event_type (no text/meta/user_id).
        await persistSystemMessage({
            conversationId,
            senderUserId: userId,
            content: text,
            metadata: { isSystem: true },
            systemEventType: 'commitment_notice',
        });
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

export const cancelCommitment = async (userId: string, id: string, reason?: string | null) => {
    const normalizedReason = reason?.trim() || null;
    const data = await applyCommitmentTransition(userId, id, 'cancel', { reason: normalizedReason });
    const userName = await getUserName(userId);
    await insertSystemMessage(
        userId,
        data.conversation_id,
        `🚫 ${userName} canceló: "${data.title}"${normalizedReason ? `. Motivo: ${normalizedReason}` : ''}`
    );
    if (data.assigned_to_user_id && data.assigned_to_user_id !== userId) {
        await notifyUser(
            data.assigned_to_user_id,
            data.type === 'meeting' ? 'Reunión cancelada' : 'Compromiso cancelado',
            `${userName} canceló "${data.title}"`,
            { type: 'commitment_cancelled', commitmentId: data.id, conversationId: data.conversation_id }
        );
    }
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

export interface CommitmentFieldEdit {
    title?: string;
    description?: string | null;
    due_at?: string | null;
    type?: 'task' | 'meeting';
    priority?: 'low' | 'medium' | 'high' | null;
    expected_result?: string | null;
}

// Canonical field editor. Lifecycle and responsibility fields are not part of
// this contract: those must use applyCommitmentTransition through an explicit
// action. The database RPC commits the row, Event and Audit evidence together.
export const editCommitment = async (
    userId: string,
    id: string,
    updates: CommitmentFieldEdit
) => {
    await assertCommitmentOwner(userId, id);

    const allowedFields: Array<keyof CommitmentFieldEdit> = [
        'title',
        'description',
        'due_at',
        'type',
        'priority',
        'expected_result',
    ];
    const patch: Record<string, unknown> = {};
    for (const field of allowedFields) {
        if (Object.prototype.hasOwnProperty.call(updates, field)) {
            patch[field] = updates[field];
        }
    }

    if (Object.keys(patch).length === 0) {
        throw new AppError('Commitment edit cannot be empty', 400);
    }

    const { data: before, error: beforeError } = await supabaseAdmin
        .from('commitments')
        .select('id, title, due_at, conversation_id')
        .eq('id', id)
        .single();
    if (beforeError) throw beforeError;

    const { data, error } = await supabaseAdmin.rpc('edit_commitment_with_evidence', {
        p_commitment_id: id,
        p_actor_user_id: userId,
        p_patch: patch,
    });
    if (error) throw error;

    const notices: string[] = [];
    if (patch.title !== undefined && data.title !== before.title) {
        notices.push(`Título actualizado: ${data.title}`);
    }
    if (patch.due_at !== undefined && data.due_at !== before.due_at) {
        const dateStr = data.due_at
            ? new Date(data.due_at).toLocaleString('es-CL', {
                timeZone: 'America/Santiago',
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            })
            : 'sin fecha';
        notices.push(`Nuevo horario: ${dateStr}`);
    }
    if (notices.length > 0) {
        await insertSystemMessage(
            userId,
            data.conversation_id || before.conversation_id,
            `✏️ ${notices.join(' · ')}`
        );
    }

    return data;
};

// Read helper for the application compatibility adapter. It is authorized
// before returning state and never mutates the aggregate.
export const getCommitmentWriteView = async (userId: string, id: string) => {
    await assertCommitmentConversationParticipant(userId, id);
    const { data, error } = await supabaseAdmin
        .from('commitments')
        .select(SELECT_AFTER_TRANSITION)
        .eq('id', id)
        .single();
    if (error) throw error;
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
            proposal_id,
            created_at,
            owner:owner_user_id(id, full_name, email, avatar_url),
            assignee:assigned_to_user_id(id, full_name, email, avatar_url)
        `);

    if (conversationId) {
        query = query.eq('conversation_id', conversationId);
    } else {
        const participantProposalIds = await getParticipantProposalIds(userId);
        query = query.or(buildCommitmentVisibilityFilter(userId, participantProposalIds));
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
    return attachAgreementResponses(data || []);
};

export const archiveCommitment = async (userId: string, id: string) => {
    await assertCommitmentOwner(userId, id);
    const { data, error } = await supabaseAdmin.rpc('archive_commitment_with_evidence', {
        p_commitment_id: id,
        p_actor_user_id: userId,
    });

    if (error) throw error;
    return data;
};

// DELETE /commitments/:id is retained as a compatibility adapter. The domain
// operation remains a recoverable archive with atomic evidence.
export const deleteCommitment = archiveCommitment;

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
