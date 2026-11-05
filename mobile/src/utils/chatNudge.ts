import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { normalizeCommitmentStatus } from './commitmentStatus';
import { isCommitmentOverdue, isProposalDatePassed } from './commitmentDisplay';
import { getProposalParticipationState } from './agreement';

// "Recordarle" inside a chat: when something is waiting on someone else
// (an answer, or a task that is late) the person who asked can send a
// friendly reminder right there. Once sent, it rests for a few hours so it
// never turns into nagging.

export const NUDGE_REST_MS = 3 * 60 * 60 * 1000;
const STORAGE_PREFIX = 'ping.nudge.';

export type NudgeReason = 'answer' | 'late';
export type NudgeTarget = { reason: NudgeReason; names: string[] };

const firstName = (name?: string | null) => (name || '').trim().split(' ')[0] || null;

export function nudgeTarget(commitment: any, myId: string | null | undefined, now: Date = new Date()): NudgeTarget | null {
    if (!myId) return null;
    const status = normalizeCommitmentStatus(commitment.status);
    if (['resolved', 'cancelled', 'rejected'].includes(status)) return null;
    // Asking for an answer once the date went by makes no sense.
    const unanswered = commitment._isAgreementProposal === true || status === 'proposed';
    if (unanswered && isProposalDatePassed(commitment.due_at, now)) return null;

    if (commitment._isAgreementProposal === true) {
        const participation = getProposalParticipationState(commitment, myId);
        if (participation.actorCanRespond || participation.pendingResponderIds.length === 0) return null;
        const responses: any[] = commitment.agreement_responses || [];
        const names = participation.pendingResponderIds
            .filter((id: string) => id !== myId)
            .map((id: string) => firstName(responses.find((r) => r.participant_user_id === id)?.participant?.full_name))
            .filter((name): name is string => !!name);
        return participation.pendingResponderIds.some((id: string) => id !== myId) ? { reason: 'answer', names } : null;
    }

    // A commitment someone asked of another person: only the one who asked reminds.
    const assignee = commitment.assigned_to_user_id;
    if (commitment.owner_user_id !== myId || !assignee || assignee === myId) return null;
    const names = [firstName(commitment.assignee?.full_name)].filter((name): name is string => !!name);
    if (status === 'proposed') return { reason: 'answer', names };
    if (status === 'accepted' && isCommitmentOverdue(commitment, now)) return { reason: 'late', names };
    return null;
}

function joinNames(names: string[]) {
    if (names.length <= 1) return names[0] || '';
    return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

export function chatReminderText(commitment: any, target: NudgeTarget): string {
    const greeting = target.names.length ? `Hola ${joinNames(target.names)}` : 'Hola';
    const when = commitment.due_at
        ? format(new Date(commitment.due_at), "EEEE d 'a las' HH:mm", { locale: es })
        : null;
    if (target.reason === 'late') {
        return `${greeting}, ¿cómo vas con «${commitment.title}»?${when ? ` Era para el ${when}.` : ''} ¡Gracias!`;
    }
    const plural = target.names.length > 1;
    return `${greeting}, ¿${plural ? 'pudieron' : 'pudiste'} ver «${commitment.title}»${when ? ` del ${when}` : ''}? ${plural ? 'Faltan sus respuestas' : 'Falta tu respuesta'}. ¡Gracias!`;
}

export function combinedReminderText(items: any[], targets: NudgeTarget[]): string {
    const names = Array.from(new Set(targets.flatMap((t) => t.names)));
    const greeting = names.length ? `Hola ${joinNames(names)}` : 'Hola';
    const lines = items.map((c) => {
        const when = c.due_at ? ` (${format(new Date(c.due_at), "EEEE d 'a las' HH:mm", { locale: es })})` : '';
        return `• ${c.title}${when}`;
    });
    return [`${greeting}, ${names.length === 1 ? 'te' : 'les'} recuerdo lo que tenemos pendiente:`, ...lines, '¡Gracias!'].join('\n');
}

export async function markNudged(ids: string[]) {
    const now = String(Date.now());
    await Promise.all(ids.map((id) => AsyncStorage.setItem(STORAGE_PREFIX + id, now).catch(() => {})));
}

export function useNudgeRest(commitmentId: string) {
    const [sentAt, setSentAt] = useState<number | null>(null);

    useEffect(() => {
        AsyncStorage.getItem(STORAGE_PREFIX + commitmentId)
            .then((raw) => { if (raw) setSentAt(Number(raw)); })
            .catch(() => {});
    }, [commitmentId]);

    const markSent = useCallback(() => {
        const now = Date.now();
        setSentAt(now);
        AsyncStorage.setItem(STORAGE_PREFIX + commitmentId, String(now)).catch(() => {});
    }, [commitmentId]);

    const resting = sentAt !== null && Date.now() - sentAt < NUDGE_REST_MS;
    return { resting, markSent };
}
