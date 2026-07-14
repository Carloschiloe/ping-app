import { Request, Response } from 'express';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { tryNormalizeCommitmentStatus } from '../utils/commitmentStatus';
import { toLegacyCommitmentListShape } from '../utils/commitmentCompat';

// V2: Insights ya NO usa group_conversation_id, is_group, el `mode` de
// Operación, active_commitment_id ni completion_outcome (mandato explicito
// de esta fase: Operación queda fuera de alcance y sus conceptos
// operacionales no deben filtrar hacia Insights). La clasificacion se basa
// exclusivamente en columnas propias de `commitments`: status, due_at,
// waiting_on_user_id/contact_id, action_completed_at, resolved_at.
//
// Cascada de prioridad DETERMINISTA (cada commitment abierto cae en
// exactamente UN bloque, nunca aparece duplicado):
//   1. actionDonePendingResolution: la accion ya se hizo, falta confirmar resuelto.
//   2. needsAttention: el usuario actual es quien debe actuar ahora (waiting_on_user_id === userId).
//   3. overdue: tiene fecha y ya paso, y nadie especifico esta bloqueando al usuario.
//   4. awaitingResponse: se esta esperando respuesta de OTRA persona (usuario o contacto externo).
//   5. upcoming: tiene fecha futura, sin nada bloqueante.
//   6. noDate: sin fecha, sin nada bloqueante.
// Los compromisos resueltos recientemente se listan aparte (recentlyResolved);
// rechazados/cancelados no se listan en Insights (no requieren accion).
const RECENTLY_RESOLVED_WINDOW_DAYS = 7;

type InsightsBucket =
    | 'actionDonePendingResolution'
    | 'needsAttention'
    | 'overdue'
    | 'awaitingResponse'
    | 'upcoming'
    | 'noDate';

export function classifyOpenCommitment(commitment: any, userId: string, nowMs: number): InsightsBucket {
    if (commitment.action_completed_at && !commitment.resolved_at) {
        return 'actionDonePendingResolution';
    }
    if (commitment.waiting_on_user_id === userId) {
        return 'needsAttention';
    }
    if (commitment.due_at && new Date(commitment.due_at).getTime() < nowMs) {
        return 'overdue';
    }
    if (commitment.waiting_on_user_id || commitment.waiting_on_contact_id) {
        return 'awaitingResponse';
    }
    if (commitment.due_at) {
        return 'upcoming';
    }
    return 'noDate';
}

export const getInsights = async (req: Request, res: Response): Promise<void> => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            res.status(401).json({ error: 'Unauthorized' });
            return;
        }

        const { data: participations, error: participationsError } = await supabaseAdmin
            .from('conversation_participants')
            .select('conversation_id')
            .eq('user_id', userId);

        if (participationsError) throw participationsError;

        const conversationIds = (participations || []).map((item) => item.conversation_id);

        const orFilter = conversationIds.length > 0
            ? `owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId},and(assigned_to_user_id.is.null,conversation_id.in.(${conversationIds.join(',')}))`
            : `owner_user_id.eq.${userId},assigned_to_user_id.eq.${userId}`;

        const { data: commitmentsRaw, error: commitmentsError } = await supabaseAdmin
            .from('commitments')
            .select(`
                id, title, description, due_at, proposed_due_at, status, type, priority,
                expected_result, next_action, follow_up_at,
                waiting_on_user_id, waiting_on_contact_id,
                action_completed_at, resolved_at, rejection_reason,
                owner_user_id, assigned_to_user_id, counterparty_contact_id, conversation_id, message_id, created_at,
                owner:owner_user_id(id, full_name, email, avatar_url),
                assignee:assigned_to_user_id(id, full_name, email, avatar_url),
                counterparty:counterparty_contact_id(id, display_name, phone, email)
            `)
            .or(orFilter);

        if (commitmentsError) throw commitmentsError;

        const commitments = commitmentsRaw || [];
        const now = Date.now();
        const resolvedWindowStart = now - RECENTLY_RESOLVED_WINDOW_DAYS * 24 * 60 * 60 * 1000;

        const buckets: Record<InsightsBucket, any[]> = {
            actionDonePendingResolution: [],
            needsAttention: [],
            overdue: [],
            awaitingResponse: [],
            upcoming: [],
            noDate: [],
        };
        const recentlyResolved: any[] = [];

        for (const commitment of commitments) {
            const normalizedStatus = tryNormalizeCommitmentStatus(commitment.status);

            if (normalizedStatus === 'resolved') {
                if (commitment.resolved_at && new Date(commitment.resolved_at).getTime() >= resolvedWindowStart) {
                    recentlyResolved.push(commitment);
                }
                continue;
            }

            if (normalizedStatus === 'rejected' || normalizedStatus === 'cancelled') {
                continue;
            }

            // proposed | accepted | counter_proposal | status desconocido
            // (se trata como abierto de forma conservadora: mejor mostrarlo
            // que ocultarlo silenciosamente).
            const bucket = classifyOpenCommitment(commitment, userId, now);
            buckets[bucket].push(commitment);
        }

        const sortByDueAtAsc = (a: any, b: any) => new Date(a.due_at || 0).getTime() - new Date(b.due_at || 0).getTime();
        buckets.overdue.sort(sortByDueAtAsc);
        buckets.upcoming.sort(sortByDueAtAsc);
        recentlyResolved.sort((a, b) => new Date(b.resolved_at || 0).getTime() - new Date(a.resolved_at || 0).getTime());

        const withCompat = (rows: any[]) => toLegacyCommitmentListShape(rows);

        res.status(200).json({
            needsAttention: withCompat(buckets.needsAttention),
            awaitingResponse: withCompat(buckets.awaitingResponse),
            overdue: withCompat(buckets.overdue),
            upcoming: withCompat(buckets.upcoming),
            noDate: withCompat(buckets.noDate),
            actionDonePendingResolution: withCompat(buckets.actionDonePendingResolution),
            recentlyResolved: withCompat(recentlyResolved),
            counts: {
                needsAttention: buckets.needsAttention.length,
                awaitingResponse: buckets.awaitingResponse.length,
                overdue: buckets.overdue.length,
                upcoming: buckets.upcoming.length,
                noDate: buckets.noDate.length,
                actionDonePendingResolution: buckets.actionDonePendingResolution.length,
                recentlyResolved: recentlyResolved.length,
            },
            // --- Alias temporales de compatibilidad (documentados, ver informe de fase) ---
            // El mobile actual (InsightsScreen.tsx) puede leer estas claves del
            // shape anterior. pendingResponse se mapea al bloque mas cercano en
            // significado (needsAttention). Los conceptos de Operación
            // (myFocuses/inProgress/teamStatusByGroup/groupsSummary) quedan
            // deliberadamente vacios: Operación esta fuera de alcance de esta
            // fase y esos campos ya no se calculan (no se ocultan con datos
            // inconsistentes, simplemente no aplican).
            pendingResponse: withCompat(buckets.needsAttention),
            myFocuses: [],
            inProgress: [],
            groupsSummary: [],
            teamStatusByGroup: [],
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
};
