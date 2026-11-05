import { describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: vi.fn(), setItem: vi.fn() } }));

import { outcomeOf, summarize } from '../src/utils/commitmentOutcome';
import { ALL_REACTIONS, QUICK_COUNT, rankReactions } from '../src/utils/reactionUsage';
import { chatReminderText, combinedReminderText, nudgeTarget } from '../src/utils/chatNudge';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', 'src', rel), 'utf-8');
const now = new Date('2026-11-04T12:00:00Z');
const past = '2026-11-01T10:00:00Z';
const future = '2026-11-09T10:00:00Z';

describe('Compromisos of one chat', () => {
    it('sorts each commitment into pending, late, done or not accepted', () => {
        expect(outcomeOf({ status: 'resolved' }, now)).toBe('done');
        expect(outcomeOf({ status: 'cancelled' }, now)).toBe('declined');
        expect(outcomeOf({ status: 'rejected' }, now)).toBe('declined');
        expect(outcomeOf({ status: 'accepted', due_at: past }, now)).toBe('overdue');
        expect(outcomeOf({ status: 'accepted', due_at: future }, now)).toBe('pending');
    });

    it('an unanswered one whose date went by is "Sin respuesta", never late work', () => {
        expect(outcomeOf({ status: 'proposed', due_at: past }, now)).toBe('expired');
        expect(outcomeOf({ _isAgreementProposal: true, status: 'proposed', due_at: past }, now)).toBe('expired');
        expect(outcomeOf({ status: 'proposed', due_at: future }, now)).toBe('pending');
        expect(summarize([{ status: 'proposed', due_at: past }, { status: 'resolved' }], now).keptPercent).toBe(100);
    });

    it('each commitment can be acted on from the list, and the late ones reminded at once', () => {
        const screen = read('screens/TaskHistoryScreen.tsx');
        expect(screen).toContain('onMarkDone={(id) => setCloseItem(');
        expect(screen).toContain('onReschedule={(item) => setDateItem(item)}');
        expect(screen).toContain('onCancel={handleCancel}');
        expect(screen).toContain('onNudge={detailItem && nudgeTarget(detailItem, user?.id) ? handleNudge : undefined}');
        expect(screen).toContain('`Recordar a todos (${remindable.length})`');
    });

    it('counts how many were kept out of those already due', () => {
        const { counts, keptPercent } = summarize([
            { status: 'resolved' }, { status: 'resolved' }, { status: 'resolved' },
            { status: 'accepted', due_at: past }, { status: 'accepted', due_at: future }, { status: 'rejected' },
        ], now);
        expect(counts).toEqual({ pending: 1, expired: 0, overdue: 1, done: 3, declined: 1 });
        expect(keptPercent).toBe(75);
        expect(summarize([{ status: 'accepted', due_at: future }], now).keptPercent).toBeNull();
    });

    it('opens from the strip under the chat bar, not a hidden menu', () => {
        const chat = read('screens/ChatScreen.tsx');
        expect(chat).toContain('<CommitmentsStrip');
        expect(chat).toContain("onPress={() => navigation.navigate('TaskHistory'");
        expect(chat).not.toContain('Historial de tareas');
        expect(chat).not.toContain('headerMenuVisible');
    });
});

describe('Reactions', () => {
    it('put the most used first and keep the default order otherwise', () => {
        expect(rankReactions({}).slice(0, 3)).toEqual(['👍', '❤️', '😂']);
        expect(rankReactions({ '🔥': 5, '🙏': 2 }).slice(0, 3)).toEqual(['🔥', '🙏', '👍']);
        expect(rankReactions({}).length).toBe(ALL_REACTIONS.length);
    });

    it('show a bigger quick row and a + for the rest', () => {
        const sheet = read('components/MessageActionsModal.tsx');
        expect(sheet).toContain('ordered.slice(0, QUICK_COUNT)');
        expect(sheet).toContain('ordered.slice(QUICK_COUNT)');
        expect(QUICK_COUNT).toBe(7);
    });
});

describe('Recordarle inside the chat', () => {
    const me = 'me';
    it('is offered to whoever asked, when the other person has not answered or is late', () => {
        const asked = { owner_user_id: me, assigned_to_user_id: 'ana', assignee: { full_name: 'Ana Pérez' }, title: 'Informe' };
        expect(nudgeTarget({ ...asked, status: 'proposed' }, me, now)).toEqual({ reason: 'answer', names: ['Ana'] });
        expect(nudgeTarget({ ...asked, status: 'accepted', due_at: past }, me, now)).toEqual({ reason: 'late', names: ['Ana'] });
        expect(nudgeTarget({ ...asked, status: 'accepted', due_at: future }, me, now)).toBeNull();
        expect(nudgeTarget({ ...asked, status: 'resolved' }, me, now)).toBeNull();
        expect(nudgeTarget({ ...asked, status: 'proposed', due_at: past }, me, now)).toBeNull();
        // The person who has to act never gets a "remind" button for themselves.
        expect(nudgeTarget({ ...asked, status: 'proposed' }, 'ana', now)).toBeNull();
    });

    it('on a shared proposal, names only those still missing an answer', () => {
        const proposal = {
            _isAgreementProposal: true, status: 'proposed', owner_user_id: me, title: 'Reunión',
            agreement_responses: [
                { participant_user_id: 'ana', status: 'approved', participant: { full_name: 'Ana Pérez' } },
                { participant_user_id: 'luis', status: 'pending', participant: { full_name: 'Luis Soto' } },
            ],
        };
        expect(nudgeTarget(proposal, me, now)).toEqual({ reason: 'answer', names: ['Luis'] });
        expect(nudgeTarget(proposal, 'luis', now)).toBeNull();
    });

    it('writes a friendly message, asked for before sending', () => {
        expect(chatReminderText({ title: 'Informe' }, { reason: 'answer', names: ['Ana'] }))
            .toBe('Hola Ana, ¿pudiste ver «Informe»? Falta tu respuesta. ¡Gracias!');
        expect(chatReminderText({ title: 'Informe' }, { reason: 'answer', names: ['Ana', 'Luis'] }))
            .toBe('Hola Ana y Luis, ¿pudieron ver «Informe»? Faltan sus respuestas. ¡Gracias!');
        expect(chatReminderText({ title: 'Informe' }, { reason: 'late', names: ['Ana'] }))
            .toBe('Hola Ana, ¿cómo vas con «Informe»? ¡Gracias!');
        const card = read('components/GroupTaskCard.tsx');
        expect(card).toContain("confirmAction({ title: 'Enviar recordatorio'");
        expect(card).toContain('Recordatorio enviado');
    });
});

describe('One reminder for several', () => {
    it('lists each pending item with its date in one message', () => {
        const text = combinedReminderText(
            [{ title: 'Informe', due_at: null }, { title: 'Muestras', due_at: null }],
            [{ reason: 'late', names: ['Ana'] }, { reason: 'answer', names: ['Ana', 'Luis'] }],
        );
        expect(text.split('\n')).toEqual(['Hola Ana y Luis, les recuerdo lo que tenemos pendiente:', '• Informe', '• Muestras', '¡Gracias!']);
        expect(combinedReminderText([{ title: 'Informe', due_at: null }], [{ reason: 'late', names: ['Ana'] }]).split('\n')[0])
            .toBe('Hola Ana, te recuerdo lo que tenemos pendiente:');
    });
});
