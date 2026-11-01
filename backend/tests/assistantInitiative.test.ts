import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: {} }));
vi.mock('../src/services/conversation.service', () => ({ getOrCreateSelfConversationId: vi.fn() }));
vi.mock('../src/services/push.service', () => ({ sendPushNotification: vi.fn() }));

import { INITIATIVE_NOTE_PREFIX, runDailySummaryInitiatives, type InitiativeDeps } from '../src/services/assistant/assistantInitiative.service';

const USER = 'user-1';
// 08:30 in Santiago (UTC-3 in November).
const MORNING = new Date('2026-11-02T11:30:00.000Z');

function deps(overrides: Partial<InitiativeDeps> = {}): InitiativeDeps & { claimed: Set<string> } {
    const claimed = new Set<string>();
    return {
        claimed,
        now: MORNING,
        listRecipients: vi.fn(async () => [{ userId: USER, timezone: 'America/Santiago', pushToken: 'ExponentPushToken[x]' }]),
        hasAgendaUntil: vi.fn(async () => true),
        claim: vi.fn(async (key: string) => {
            if (claimed.has(key)) return false;
            claimed.add(key);
            return true;
        }),
        complete: vi.fn(async () => undefined),
        fail: vi.fn(async () => undefined),
        selfConversationId: vi.fn(async () => 'self-1'),
        runTurn: vi.fn(async () => ({
            result: { kind: 'response' as const, response: { status: 'answered' as const, answer: 'Buenos días. Hoy tienes la reunión con Pedro a las 11.', citations: [] } },
            memory: { version: 1 },
        })),
        persistTurn: vi.fn(async () => undefined),
        push: vi.fn(async () => undefined),
        ...overrides,
    };
}

describe('M10 — daily summary initiative', () => {
    it('writes the summary as an initiative turn in the self-chat and notifies the phone', async () => {
        const d = deps();
        expect(await runDailySummaryInitiatives(d)).toEqual({ checked: 1, sent: 1 });

        expect(d.hasAgendaUntil).toHaveBeenCalledWith(USER, '2026-11-03T03:00:00.000Z');
        expect(d.claim).toHaveBeenCalledWith(`daily_summary:${USER}:2026-11-02`, USER, 'daily_summary', '2026-11-02');
        const turn = (d.runTurn as any).mock.calls[0][0];
        expect(turn).toMatchObject({ userId: USER, conversationId: 'self-1', timezone: 'America/Santiago' });
        expect(turn.text.startsWith(INITIATIVE_NOTE_PREFIX)).toBe(true);
        expect(d.persistTurn).toHaveBeenCalledWith(expect.objectContaining({
            key: `daily_summary:${USER}:2026-11-02`,
            result: expect.objectContaining({ initiative: { kind: 'daily_summary' } }),
        }));
        expect(d.push).toHaveBeenCalledWith('ExponentPushToken[x]', 'Ping', 'Buenos días. Hoy tienes la reunión con Pedro a las 11.');
        expect(d.complete).toHaveBeenCalledWith(`daily_summary:${USER}:2026-11-02`);
    });

    it('sends it once per local day, however many passes run', async () => {
        const d = deps();
        await runDailySummaryInitiatives(d);
        await runDailySummaryInitiatives({ ...d, now: new Date('2026-11-02T11:55:00.000Z') });
        expect(d.runTurn).toHaveBeenCalledTimes(1);
    });

    it('stays quiet outside the summary hour and on an empty day', async () => {
        const early = deps({ now: new Date('2026-11-02T10:30:00.000Z') });
        expect(await runDailySummaryInitiatives(early)).toEqual({ checked: 0, sent: 0 });

        const empty = deps({ hasAgendaUntil: vi.fn(async () => false) });
        expect(await runDailySummaryInitiatives(empty)).toEqual({ checked: 1, sent: 0 });
        expect(empty.claim).not.toHaveBeenCalled();
        expect(empty.runTurn).not.toHaveBeenCalled();
    });

    it('keeps the chat message without a push token, and releases the claim when the turn fails', async () => {
        const silent = deps({ listRecipients: vi.fn(async () => [{ userId: USER, timezone: 'America/Santiago', pushToken: null }]) });
        expect((await runDailySummaryInitiatives(silent)).sent).toBe(1);
        expect(silent.push).not.toHaveBeenCalled();

        const broken = deps({ runTurn: vi.fn(async () => { throw new Error('model down'); }) });
        expect((await runDailySummaryInitiatives(broken)).sent).toBe(0);
        expect(broken.fail).toHaveBeenCalledWith(`daily_summary:${USER}:2026-11-02`, 'model down');
        expect(broken.persistTurn).not.toHaveBeenCalled();
    });
});
