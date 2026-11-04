import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    useResolveCommitment, useCancelCommitment, useReopenCommitment,
    useUpdateCommitment, useScheduleFollowUp,
} from '../api/queries';
import { closingResult, type CloseOutcome } from '../utils/commitmentClosing';

export type ClosedNotice = { text: string; undo: () => void };

// Saves how a commitment went. Done closes it, not done calls it off, and
// half done keeps it open with a new date and what is missing as its next
// step. Each one says what happened and how to take it back.
export function useCloseCommitment() {
    const { mutateAsync: resolve, isPending: resolving } = useResolveCommitment();
    const { mutateAsync: cancel, isPending: cancelling } = useCancelCommitment();
    const { mutateAsync: update, isPending: updating } = useUpdateCommitment();
    const { mutateAsync: followUp, isPending: following } = useScheduleFollowUp();
    const { mutate: reopen } = useReopenCommitment();

    const close = async (item: any, outcome: CloseOutcome, note: string, dueAt?: Date | null): Promise<ClosedNotice> => {
        const isMeeting = item.type === 'meeting';
        if (outcome === 'partial' && dueAt) {
            const previous = item.due_at ?? null;
            const iso = dueAt.toISOString();
            await update({ id: item.id, data: { due_at: iso } });
            const missing = note.trim();
            if (missing) await followUp({ id: item.id, followUpAt: iso, nextAction: missing });
            return {
                text: `Quedó para el ${format(dueAt, "EEEE d 'de' MMMM", { locale: es })}.`,
                undo: () => update({ id: item.id, data: { due_at: previous } }),
            };
        }
        if (outcome === 'not_done') {
            await cancel({ id: item.id, reason: closingResult(outcome, note, isMeeting) });
            return { text: 'Cerrado como no hecho.', undo: () => reopen(item.id) };
        }
        await resolve({ id: item.id, result: closingResult(outcome, note, isMeeting) });
        return { text: 'Marcado como hecho.', undo: () => reopen(item.id) };
    };

    return { close, isSaving: resolving || cancelling || updating || following };
}
