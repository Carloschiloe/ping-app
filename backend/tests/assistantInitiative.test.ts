import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: {} }));
vi.mock('../src/services/conversation.service', () => ({ getOrCreateSelfConversationId: vi.fn() }));
vi.mock('../src/services/push.service', () => ({ sendPushNotification: vi.fn() }));

import {
    DAILY_INITIATIVE_LIMIT,
    INITIATIVE_NOTE_PREFIX,
    overdueNote,
    runInitiativePass,
    type InitiativeDeps,
} from '../src/services/assistant/assistantInitiative.service';

const USER = 'user-1';
// Santiago is UTC-3 in November.
const MORNING = new Date('2026-11-02T11:30:00.000Z'); // 08:30
const AFTERNOON = new Date('2026-11-02T18:30:00.000Z'); // 15:30
const CALL = { id: 'c1', title: 'Llamar a Juan', dueAt: '2026-11-02T18:00:00.000Z' }; // 15:00
const PREFS = { dailySummary: true, summaryHour: 8, summaryMinute: 0, summaryDays: [0, 1, 2, 3, 4, 5, 6], overdueNotices: true };

function deps(overrides: Partial<InitiativeDeps> = {}): InitiativeDeps {
    const claimed = new Set<string>();
    return {
        now: MORNING,
        listRecipients: vi.fn(async () => [{ userId: USER, timezone: 'America/Santiago', pushToken: 'ExponentPushToken[x]', ...PREFS }]),
        hasAgendaUntil: vi.fn(async () => true),
        listOverdue: vi.fn(async () => []),
        countSentOn: vi.fn(async () => 0),
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
        expect(await runInitiativePass(d)).toEqual({ summaries: 1, overdue: 0 });

        expect(d.hasAgendaUntil).toHaveBeenCalledWith(USER, '2026-11-03T03:00:00.000Z');
        expect(d.claim).toHaveBeenCalledWith(`daily_summary:${USER}:2026-11-02`, USER, 'daily_summary', '2026-11-02');
        const turn = (d.runTurn as any).mock.calls[0][0];
        expect(turn).toMatchObject({ userId: USER, conversationId: 'self-1', timezone: 'America/Santiago' });
        expect(turn.text.startsWith(INITIATIVE_NOTE_PREFIX)).toBe(true);
        expect(d.persistTurn).toHaveBeenCalledWith(expect.objectContaining({
            key: `daily_summary:${USER}:2026-11-02`,
            result: expect.objectContaining({ initiative: { kind: 'daily_summary' } }),
        }));
        // The notice invites to hear the day; the voice reads the summary itself.
        expect(d.push).toHaveBeenCalledWith('ExponentPushToken[x]', 'Vorian', 'Buenos días ☀️ ¿Te cuento tu día?', {
            type: 'ping_assistant', kind: 'daily_summary', spoken: 'Buenos días. Hoy tienes la reunión con Pedro a las 11.',
        });
        expect(turn.text).toContain('Empieza con «Buenos días»');
        expect(turn.text).toContain('para ser escuchado en voz alta');
        expect(d.complete).toHaveBeenCalledWith(`daily_summary:${USER}:2026-11-02`);
        expect(d.listOverdue).not.toHaveBeenCalled();
    });

    it('sends it once per local day, however many passes run', async () => {
        const d = deps();
        await runInitiativePass(d);
        await runInitiativePass({ ...d, now: new Date('2026-11-02T11:55:00.000Z') });
        expect(d.runTurn).toHaveBeenCalledTimes(1);
    });

    it('stays quiet before the summary time, and greets by name also on a free day', async () => {
        const early = deps({ now: new Date('2026-11-02T10:30:00.000Z') });
        expect(await runInitiativePass(early)).toEqual({ summaries: 0, overdue: 0 });

        const empty = deps({
            hasAgendaUntil: vi.fn(async () => false),
            listRecipients: vi.fn(async () => [{ userId: USER, timezone: 'America/Santiago', pushToken: 'ExponentPushToken[x]', firstName: 'Carlos', ...PREFS }]),
        });
        expect(await runInitiativePass(empty)).toEqual({ summaries: 1, overdue: 0 });
        const note = (empty.runTurn as any).mock.calls[0][0].text;
        expect(note).toContain('Empieza con «Buenos días Carlos»');
        expect(note).toContain('No tiene nada pendiente');
        expect((empty.push as any).mock.calls[0][2]).toBe('Buenos días Carlos ☀️ ¿Te cuento tu día?');
    });

    it('keeps the chat message without a push token, and releases the claim when the turn fails', async () => {
        const silent = deps({ listRecipients: vi.fn(async () => [{ userId: USER, timezone: 'America/Santiago', pushToken: null, ...PREFS }]) });
        expect((await runInitiativePass(silent)).summaries).toBe(1);
        expect(silent.push).not.toHaveBeenCalled();

        const broken = deps({ runTurn: vi.fn(async () => { throw new Error('model down'); }) });
        expect((await runInitiativePass(broken)).summaries).toBe(0);
        expect(broken.fail).toHaveBeenCalledWith(`daily_summary:${USER}:2026-11-02`, 'model down');
        expect(broken.persistTurn).not.toHaveBeenCalled();
    });
});

describe('M10 — overdue initiative', () => {
    it('tells the user once that an item passed, offering to move it', async () => {
        const d = deps({ now: AFTERNOON, listOverdue: vi.fn(async () => [CALL]) });
        expect(await runInitiativePass(d)).toEqual({ summaries: 0, overdue: 1 });
        await runInitiativePass(d);

        // Newly overdue: due between 3h15m and 15m ago.
        expect(d.listOverdue).toHaveBeenCalledWith(USER, '2026-11-02T15:15:00.000Z', '2026-11-02T18:15:00.000Z');
        expect(d.claim).toHaveBeenCalledWith(`overdue:c1:${CALL.dueAt}`, USER, 'overdue', '2026-11-02');
        expect(d.runTurn).toHaveBeenCalledTimes(1);
        const note = (d.runTurn as any).mock.calls[0][0].text as string;
        expect(note).toContain('«Llamar a Juan»');
        expect(note).toContain('era para hoy a las 15:00');
        expect(note).toContain('propose_reschedule');
        expect(d.persistTurn).toHaveBeenCalledWith(expect.objectContaining({ result: expect.objectContaining({ initiative: { kind: 'overdue' } }) }));
    });

    it('groups several items into one notice and only asks what to do', async () => {
        const other = { id: 'c2', title: 'Comprar pan', dueAt: '2026-11-02T17:00:00.000Z' };
        const d = deps({ now: AFTERNOON, listOverdue: vi.fn(async () => [other, CALL]) });
        expect((await runInitiativePass(d)).overdue).toBe(1);
        expect(d.runTurn).toHaveBeenCalledTimes(1);
        expect(d.complete).toHaveBeenCalledTimes(2);
        expect(overdueNote([{ ...CALL, dueAt: '2026-11-01T18:00:00.000Z' }], AFTERNOON, 'America/Santiago')).toContain('era para ayer a las 15:00');
        expect(overdueNote([other, CALL], AFTERNOON, 'America/Santiago')).not.toContain('propose_reschedule');
    });

    it('waits for daytime after the summary hour and respects the daily limit', async () => {
        for (const now of ['2026-11-02T11:30:00.000Z', '2026-11-03T01:30:00.000Z']) { // 08:30 and 22:30
            const d = deps({ now: new Date(now), hasAgendaUntil: vi.fn(async () => false), listOverdue: vi.fn(async () => [CALL]) });
            expect((await runInitiativePass(d)).overdue).toBe(0);
            expect(d.listOverdue).not.toHaveBeenCalled();
        }

        const full = deps({ now: AFTERNOON, listOverdue: vi.fn(async () => [CALL]), countSentOn: vi.fn(async () => DAILY_INITIATIVE_LIMIT) });
        expect((await runInitiativePass(full)).overdue).toBe(0);
        expect(full.claim).not.toHaveBeenCalled();
    });

    it('one user failing does not stop the next one', async () => {
        const d = deps({
            now: AFTERNOON,
            listRecipients: vi.fn(async () => [
                { userId: 'broken', timezone: 'America/Santiago', pushToken: null, ...PREFS },
                { userId: USER, timezone: 'America/Santiago', pushToken: null, ...PREFS },
            ]),
            listOverdue: vi.fn(async (userId: string) => {
                if (userId === 'broken') throw new Error('db down');
                return [CALL];
            }),
        });
        expect((await runInitiativePass(d)).overdue).toBe(1);
    });
});

describe('M10 — notice preferences', () => {
    const recipient = (prefs: Partial<typeof PREFS>) => vi.fn(async () => [{ userId: USER, timezone: 'America/Santiago', pushToken: null, ...PREFS, ...prefs }]);

    it('sends the summary at the hour the user chose, and not when it is off', async () => {
        const at10 = deps({ now: new Date('2026-11-02T13:05:00.000Z'), listRecipients: recipient({ summaryHour: 10 }) }); // 10:05
        expect((await runInitiativePass(at10)).summaries).toBe(1);
        expect((await runInitiativePass(deps({ listRecipients: recipient({ summaryHour: 10 }) }))).summaries).toBe(0); // 08:30

        const off = deps({ listRecipients: recipient({ dailySummary: false }) });
        expect((await runInitiativePass(off)).summaries).toBe(0);
        expect(off.hasAgendaUntil).not.toHaveBeenCalled();
    });

    it('sends it at any time and minute the user chose, only on the chosen days', async () => {
        // 2026-11-02 is a Monday (1).
        const at1415 = (now: string, prefs: Partial<typeof PREFS> = {}) => deps({ now: new Date(now), listRecipients: recipient({ summaryHour: 14, summaryMinute: 15, ...prefs }) });
        expect((await runInitiativePass(at1415('2026-11-02T17:10:00.000Z'))).summaries).toBe(0); // 14:10
        expect((await runInitiativePass(at1415('2026-11-02T17:15:00.000Z'))).summaries).toBe(1); // 14:15
        expect((await runInitiativePass(at1415('2026-11-02T17:15:00.000Z', { summaryDays: [2, 3, 4, 5] }))).summaries).toBe(0);
        expect((await runInitiativePass(at1415('2026-11-02T17:15:00.000Z', { summaryDays: [1] }))).summaries).toBe(1);
    });

    it('still sends a summary missed while the server slept, the same day', async () => {
        const early = deps({ now: new Date('2026-11-02T10:05:00.000Z'), listRecipients: recipient({ summaryHour: 5, summaryMinute: 30 }) }); // 07:05 for 05:30
        expect((await runInitiativePass(early)).summaries).toBe(1);
        const tooLate = deps({ now: new Date('2026-11-02T15:05:00.000Z'), listRecipients: recipient({ summaryHour: 5, summaryMinute: 30 }) }); // 12:05
        expect((await runInitiativePass(tooLate)).summaries).toBe(0);
    });

    it('an evening summary also looks at tomorrow', async () => {
        const night = deps({ now: new Date('2026-11-03T00:00:00.000Z'), listRecipients: recipient({ summaryHour: 21 }) }); // 21:00
        expect((await runInitiativePass(night)).summaries).toBe(1);
        expect(night.hasAgendaUntil).toHaveBeenCalledWith(USER, '2026-11-04T03:00:00.000Z');
        expect((night.runTurn as any).mock.calls[0][0].text).toContain('lo que tiene mañana');
    });

    it('skips overdue notices when they are off, and waits until after a later summary hour', async () => {
        const off = deps({ now: AFTERNOON, listRecipients: recipient({ overdueNotices: false }), listOverdue: vi.fn(async () => [CALL]) });
        expect((await runInitiativePass(off)).overdue).toBe(0);
        expect(off.listOverdue).not.toHaveBeenCalled();

        const late = deps({ now: new Date('2026-11-02T13:30:00.000Z'), hasAgendaUntil: vi.fn(async () => false), listRecipients: recipient({ summaryHour: 10 }), listOverdue: vi.fn(async () => [CALL]) }); // 10:30
        expect((await runInitiativePass(late)).overdue).toBe(0);
        expect(late.listOverdue).not.toHaveBeenCalled();
    });
});
