import OpenAI from 'openai';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { NotificationService } from './notification.service';
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
import { resolveTimeZone } from './date-parser.service';
import { formatLocal, localDateTimeToIso } from './assistant/assistantTime';
import { timeZoneOffsetMs } from '../utils/timezone';
import { dispatchCommitmentStatusMemoryEvent } from './canonicalMemoryEvents.service';

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

const SYSTEM_PROMPT = `Eres un asistente de productividad en español (Chile). Lees un mensaje de chat y decides si contiene un compromiso, tarea, recordatorio o reunión con fecha u hora.

Devuelve JSON con:
- hasCommitment (boolean): true si hay un compromiso, tarea o evento con fecha/hora implícita o explícita.
- title (string | null): el asunto en pocas palabras, como lo anotaría una persona en su agenda (máx 60 caracteres). Nunca repitas la fecha ni la hora en el título. Ejemplos: "Mañana a las 3 llamo al banco por el crédito" → "Llamar al banco por el crédito"; "El viernes junta con el equipo, tema presupuesto" → "Reunión de presupuesto con el equipo".
- dueLocal (string | null): fecha y hora LOCAL del usuario en formato "YYYY-MM-DDTHH:mm". Elige el día mirando el calendario que viene en el mensaje; no calcules días de la semana por tu cuenta.
- assignedToName (string | null): nombre de la persona responsable. Prioriza menciones con @ (ej: "@Carlos" → "Carlos"). Si es para quien escribe o no está claro, null.
- type (string): "meeting" si es una reunión, llamada, junta o evento con hora fija; "task" si es una acción a realizar.

Reglas:
- Un día de la semana ("el jueves", "este jueves") es su próxima fecha en el calendario; si ese día es hoy, es dentro de una semana, salvo que diga "hoy".
- "mañana" es el día siguiente a hoy.
- Una hora sin am/pm es la más sensata del día (reuniones y trámites, normalmente entre 08:00 y 21:59).
- Si hay día pero no hora, usa 09:00.
- Si el mensaje es solo una imagen sin texto, devuelve hasCommitment: false salvo que la imagen sea claramente una tarea (por ejemplo, una lista de pendientes).
- Si no hay compromiso claro, devuelve hasCommitment: false y null en los demás campos.
- Entiende el lenguaje natural chileno y usa todo el contexto del mensaje.

Responde SOLO con JSON válido.`;

const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

// The next two weeks as the user sees them ("jueves 2026-11-05"), so the
// model reads the date off a calendar instead of doing weekday arithmetic.
export function buildLocalCalendar(now: Date, timeZone: string, days = 14): string {
    const local = new Date(now.getTime() + timeZoneOffsetMs(now, timeZone));
    const pad = (n: number) => String(n).padStart(2, '0');
    const lines: string[] = [];
    for (let i = 0; i < days; i++) {
        const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i));
        const label = i === 0 ? ' (hoy)' : i === 1 ? ' (mañana)' : '';
        lines.push(`${WEEKDAY_NAMES[day.getUTCDay()]} ${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}${label}`);
    }
    return lines.join('\n');
}

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
        const parsedNow = new Date(nowIso);
        const now = Number.isNaN(parsedNow.getTime()) ? new Date() : parsedNow;
        const userContent: any[] = [{
            type: 'text',
            text: `Ahora: ${formatLocal(now.toISOString(), timeZone)} (${timeZone})\n\nCalendario:\n${buildLocalCalendar(now, timeZone)}\n\nMensaje: "${text}"`,
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
            dueAt: typeof parsed.dueLocal === 'string' ? localDateTimeToIso(parsed.dueLocal, timeZone) : null,
            replyText: 'Agendar',
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

    // M-2 FINAL — ÚNICO punto de ingesta de memoria para TODO el dominio de
    // commitments: applyCommitmentTransition es el funnel real que ya usan
    // las 8 transiciones públicas (accept/reject/counter_propose/resolve/
    // cancel/reopen/reassign/action_complete) -- un solo call site cierra el
    // ciclo de dominancia canónica para cualquier transición, no sólo una.
    // Idempotente incluso cuando `action` no cambia `status` (ej. reassign):
    // el content_hash de memory.service.ts colapsa el hecho repetido como
    // "duplicate", nunca como un segundo hecho activo. Nunca puede fallar la
    // transición canónica ya confirmada (ver canonicalMemoryEvents.service.ts).
    await dispatchCommitmentStatusMemoryEvent({
        ownerUserId: data.owner_user_id,
        sourceType: 'commitment',
        sourceId: data.id,
        title: data.title,
        newStatus: data.status,
        conversationId: data.conversation_id ?? null,
    });

    return data;
}

export const acceptCommitment = async (userId: string, id: string) => {
    console.log(`[Commitment Service] acceptCommitment: userId=${userId}, commitmentId=${id}`);
    const data = await applyCommitmentTransition(userId, id, 'accept');

    console.log(`[Commitment Service] Commitment updated to accepted: ${data.id}`);
    const userName = await getUserName(userId);
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
    return data;
};

// The other side of a commitment hears that it was closed and how it went.
function otherParty(data: { owner_user_id?: string | null; assigned_to_user_id?: string | null }, userId: string) {
    const other = data.owner_user_id === userId ? data.assigned_to_user_id : data.owner_user_id;
    return other && other !== userId ? other : null;
}

export const resolveCommitment = async (userId: string, id: string, resolutionResult: string) => {
    const data = await applyCommitmentTransition(userId, id, 'resolve', { resolutionResult });
    const recipient = otherParty(data, userId);
    if (recipient) {
        const userName = await getUserName(userId);
        await notifyUser(
            recipient,
            data.type === 'meeting' ? 'Reunión realizada' : 'Compromiso cerrado',
            `${userName} cerró "${data.title}": ${resolutionResult.trim()}`,
            { type: 'commitment_resolved', commitmentId: data.id, conversationId: data.conversation_id }
        );
    }
    return data;
};

export const cancelCommitment = async (userId: string, id: string, reason?: string | null) => {
    const normalizedReason = reason?.trim() || null;
    const data = await applyCommitmentTransition(userId, id, 'cancel', { reason: normalizedReason });
    const userName = await getUserName(userId);
    const recipient = otherParty(data, userId);
    if (recipient) {
        await notifyUser(
            recipient,
            data.type === 'meeting' ? 'Reunión cancelada' : 'Compromiso cancelado',
            `${userName} canceló "${data.title}"${normalizedReason ? `: ${normalizedReason}` : ''}`,
            { type: 'commitment_cancelled', commitmentId: data.id, conversationId: data.conversation_id }
        );
    }
    return data;
};

export const reopenCommitment = async (userId: string, id: string) => {
    const data = await applyCommitmentTransition(userId, id, 'reopen');
    return data;
};

export const reassignCommitment = async (userId: string, id: string, newAssignedToUserId?: string | null, newCounterpartyContactId?: string | null) => {
    const data = await applyCommitmentTransition(userId, id, 'reassign', {
        newAssignedToUserId: newAssignedToUserId ?? null,
        newCounterpartyContactId: newCounterpartyContactId ?? null,
    });
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

    const { data, error } = await supabaseAdmin.rpc('edit_commitment_with_evidence', {
        p_commitment_id: id,
        p_actor_user_id: userId,
        p_patch: patch,
    });
    if (error) throw error;

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

// PING — ARCHIVE LIFECYCLE COMPLETION: symmetric counterpart to
// archiveCommitment. Same owner-only authorization, same atomic-evidence
// RPC pattern (restore_commitment_with_evidence, mirrors
// archive_commitment_with_evidence exactly: row lock, owner check,
// archived_at write -- here to null instead of now() -- Event + Audit
// evidence in the same transaction). Never a status transition: the RPC
// itself only ever writes archived_at/updated_at, proven by the same kind
// of test already covering archive (see commitmentService.test.ts).
export const restoreCommitment = async (userId: string, id: string) => {
    await assertCommitmentOwner(userId, id);
    const { data, error } = await supabaseAdmin.rpc('restore_commitment_with_evidence', {
        p_commitment_id: id,
        p_actor_user_id: userId,
    });

    if (error) throw error;
    return data;
};

// PING — ARCHIVE LIFECYCLE COMPLETION: explicit archived-only retrieval,
// never merged into getCommitments' default (which must keep excluding
// archived_at unconditionally -- every other caller, including the Agent's
// retrieval.service.ts, depends on that). Reuses the exact same visibility
// filter/columns as getCommitments -- an archived commitment is still
// scoped to the same owner/assignee/participant rules, only its
// archived_at predicate is inverted.
export const getArchivedCommitments = async (userId: string) => {
    const participantProposalIds = await getParticipantProposalIds(userId);
    const { data, error } = await supabaseAdmin
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
        `)
        .or(buildCommitmentVisibilityFilter(userId, participantProposalIds))
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false });

    if (error) throw error;
    return attachAgreementResponses(data || []);
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
