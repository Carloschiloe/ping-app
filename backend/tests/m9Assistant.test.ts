// M9 assistant — offline tests. A scripted model stands in for the provider,
// so these check the safety contract of the tools and the loop, not language.
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/agentConversationTurn.service', () => ({
    listAgentConversationTurns: vi.fn(),
}));

import { listAgentConversationTurns } from '../src/services/agentConversationTurn.service';
import { runAssistantTurn, type AssistantTurnInput } from '../src/services/assistant/assistantService';
import { AssistantRefTable } from '../src/services/assistant/assistantRefs';
import { describeLocal, localDateTimeToIso, localDayRangeToIso } from '../src/services/assistant/assistantTime';
import {
    clearAssistantHistoryCacheForTests,
    compactAssistantMemory,
    forgetAssistantHistory,
    loadAssistantHistory,
    runAssistantModeTurn,
} from '../src/services/assistant/assistantTurn.service';
import { toResponsesInput } from '../src/services/assistant/assistantModel';
import type {
    AssistantChatMessage,
    AssistantHistory,
    AssistantModel,
    AssistantModelResponse,
    AssistantTurnOutput,
} from '../src/services/assistant/assistantTypes';
import { BenchWorld } from './support/m9BenchWorld';
import { BENCH_ACTOR, BENCH_NOW, BENCH_TIMEZONE } from './fixtures/m9AssistantBench';

type Call = [name: string, args: Record<string, unknown>];
type Step = Call[] | string | ((messages: AssistantChatMessage[]) => Call[] | string);

/** Plays a fixed script: each step is a batch of tool calls or a final answer. */
class ScriptedModel implements AssistantModel {
    public readonly modelName = 'scripted';
    public readonly seen: AssistantChatMessage[][] = [];
    private callCount = 0;

    public constructor(private readonly steps: Step[]) {}

    async complete(messages: AssistantChatMessage[]): Promise<AssistantModelResponse> {
        this.seen.push(messages);
        const raw = this.steps.shift() ?? 'listo';
        const step = typeof raw === 'function' ? raw(messages) : raw;
        if (typeof step === 'string') return { content: step, toolCalls: [] };
        return {
            content: null,
            toolCalls: step.map(([name, args]) => ({
                id: `call_${++this.callCount}`, type: 'function' as const,
                function: { name, arguments: JSON.stringify(args) },
            })),
        };
    }
}

const LIST_TODAY: Call = ['list_commitments', { from: '2026-10-31', to: '2026-10-31', status: 'open', person: null, text: null }];

class Conversation {
    public readonly world = new BenchWorld();
    public history: AssistantHistory = { turns: [], refs: [], actions: [] };

    async say(text: string, steps: Step[], voice: Pick<AssistantTurnInput, 'channel' | 'userWordsHeard'> = {}): Promise<AssistantTurnOutput> {
        const output = await runAssistantTurn(
            { actorUserId: BENCH_ACTOR, text, timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: this.history, ...voice },
            { data: this.world, model: new ScriptedModel(steps) },
        );
        this.history = {
            turns: [...this.history.turns, output.memory.messages],
            refs: output.memory.refs,
            actions: output.memory.actions,
        };
        return output;
    }
}

function toolResults(output: AssistantTurnOutput): any[] {
    return output.memory.messages.filter((message) => message.role === 'tool').map((message) => JSON.parse((message as { content: string }).content));
}

describe('M9 assistant tools — safety contract', () => {
    it('never executes a proposal confirmed in the same turn', async () => {
        const chat = new Conversation();
        const output = await chat.say('completa la llamada', [
            [LIST_TODAY],
            [['propose_complete', { ref: 'c1', note: null }]],
            [['confirm_action', { action: 'a1' }]],
            'Listo.',
        ]);
        expect(toolResults(output)[2]).toMatchObject({ error: 'needs_user_confirmation' });
        expect(chat.world.executed).toHaveLength(0);
        expect(output.trace.some((entry) => entry.confirmed)).toBe(false);
    });

    it('executes a confirmed proposal exactly once in a later turn', async () => {
        const chat = new Conversation();
        await chat.say('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿La marco como completada?']);
        const yes = await chat.say('sí', [[['confirm_action', { action: 'a1' }]], 'Hecho.']);
        expect(toolResults(yes)[0]).toMatchObject({ executed: true });
        expect(chat.world.executed).toHaveLength(1);

        const again = await chat.say('sí, de nuevo', [[['confirm_action', { action: 'a1' }]], 'Ya estaba.']);
        expect(toolResults(again)[0]).toMatchObject({ error: 'not_pending' });
        expect(chat.world.executed).toHaveLength(1);
    });

    it('a later proposal supersedes the earlier pending one; same-turn proposals stay together', async () => {
        const chat = new Conversation();
        await chat.say('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        const both = await chat.say('no, mejor completa las otras dos', [
            [['propose_complete', { ref: 'c2', note: null }], ['propose_complete', { ref: 'c3', note: null }]],
            '¿Confirmas las dos?',
        ]);
        expect(both.memory.actions.map((action) => [action.ref, action.state])).toEqual([
            ['a1', 'superseded'], ['a2', 'pending'], ['a3', 'pending'],
        ]);
        const pendingInWorld = [...chat.world.pending.values()].filter((action) => action.state === 'pending');
        expect(pendingInWorld).toHaveLength(2);

        const stale = await chat.say('sí', [[['confirm_action', { action: 'a1' }]], 'ok']);
        expect(toolResults(stale)[0]).toMatchObject({ error: 'not_pending' });
        expect(chat.world.executed).toHaveLength(0);
    });

    it('refuses refs it never showed and changes the user does not own', async () => {
        const chat = new Conversation();
        const output = await chat.say('cancela todo', [
            [['propose_cancel', { ref: 'c99' }]],
            [['list_commitments', { from: null, to: null, status: 'open', person: null, text: 'informe' }]],
            (messages) => {
                const listed = JSON.parse((messages[messages.length - 1] as { content: string }).content);
                return [['propose_cancel', { ref: listed.items[0].ref }]];
            },
            'No puedo cancelar eso.',
        ]);
        const [unknown, , notOwner] = toolResults(output);
        expect(unknown).toMatchObject({ error: 'unknown_ref' });
        expect(notOwner.error).toBeTruthy();
        expect(chat.world.pending.size).toBe(0);
    });

    it('rejects a new commitment in the past', async () => {
        const chat = new Conversation();
        const output = await chat.say('anota algo a las 9', [
            [['propose_create_commitment', { title: 'Algo', due: '2026-10-31T09:00', person: null }]],
            'Esa hora ya pasó.',
        ]);
        expect(toolResults(output)[0]).toMatchObject({ error: 'due_in_past' });
        expect(chat.world.pending.size).toBe(0);
    });

    it('a discarded proposal can no longer be confirmed', async () => {
        const chat = new Conversation();
        await chat.say('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        await chat.say('no, déjalo', [[['discard_action', { action: 'a1' }]], 'Ok.']);
        const late = await chat.say('ya, sí', [[['confirm_action', { action: 'a1' }]], 'ok']);
        expect(toolResults(late)[0]).toMatchObject({ error: 'not_pending' });
        expect(chat.world.executed).toHaveLength(0);
    });

    it('never puts internal ids into what the model reads', async () => {
        const chat = new Conversation();
        const output = await chat.say('¿qué tengo hoy?', [[LIST_TODAY], [['find_person', { name: 'Ana' }]], 'Tienes tres cosas.']);
        const toolText = output.memory.messages.filter((message) => message.role === 'tool').map((message) => (message as { content: string }).content).join('\n');
        expect(toolText).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    });

    it('stops after the tool round budget with an honest fallback', async () => {
        const chat = new Conversation();
        const output = await chat.say('¿qué tengo?', Array.from({ length: 10 }, () => [LIST_TODAY]));
        expect(output.answer).toBe('No alcancé a terminar eso. ¿Me lo dices de nuevo?');
        expect(output.trace).toHaveLength(6);
    });

    it('shows the pending action and earlier turns to the model', async () => {
        const chat = new Conversation();
        await chat.say('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        const model = new ScriptedModel(['Ok']);
        await runAssistantTurn(
            { actorUserId: BENCH_ACTOR, text: 'mm', timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: chat.history },
            { data: chat.world, model },
        );
        const transcript = model.seen[0];
        expect(transcript.some((message) => message.role === 'user' && message.content === 'completa la llamada')).toBe(true);
        expect(transcript.some((message) => message.role === 'system' && message.content.includes('a1 —'))).toBe(true);
    });

    it('a voice "yes" the user was not heard saying does not execute', async () => {
        const chat = new Conversation();
        await chat.say('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?'], { channel: 'voice' });
        const unheard = await chat.say('sí', [[['confirm_action', { action: 'a1' }]], 'No te escuché bien.'], { channel: 'voice', userWordsHeard: false });
        expect(toolResults(unheard)[0]).toMatchObject({ error: 'not_heard' });
        expect(chat.world.executed).toHaveLength(0);
        expect(unheard.memory.actions[0].state).toBe('pending');

        const heard = await chat.say('sí', [[['confirm_action', { action: 'a1' }]], 'Hecho.'], { channel: 'voice', userWordsHeard: true });
        expect(toolResults(heard)[0]).toMatchObject({ executed: true });
        expect(chat.world.executed).toHaveLength(1);
    });

    it('tells the model when its answer will be spoken', async () => {
        const spoken = new ScriptedModel(['Ok']);
        const written = new ScriptedModel(['Ok']);
        const base = { actorUserId: BENCH_ACTOR, text: 'hola', timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: { turns: [], refs: [], actions: [] } };
        await runAssistantTurn({ ...base, channel: 'voice' }, { data: new BenchWorld(), model: spoken });
        await runAssistantTurn(base, { data: new BenchWorld(), model: written });
        const systemText = (model: ScriptedModel) => model.seen[0].filter((message) => message.role === 'system').map((message) => message.content).join('\n');
        expect(systemText(spoken)).toContain('talking by voice');
        expect(systemText(written)).not.toContain('talking by voice');
    });
});

describe('Sources of an answer', () => {
    it('names each commitment it read, so the sources list is readable', async () => {
        const chat = new Conversation();
        const output = await chat.say('qué tengo hoy', [[LIST_TODAY], 'Tienes cosas hoy.']);
        const listed = toolResults(output)[0].items as Array<{ title: string }>;
        expect(listed.length).toBeGreaterThan(0);
        expect(output.citations.map((citation) => citation.label)).toEqual(listed.map((item) => item.title));
    });
});

describe('M11 assistant memory', () => {
    const systemText = (model: ScriptedModel) => model.seen[0].filter((message) => message.role === 'system').map((message) => message.content).join('\n');
    const FACT_ID = 'ffffffff-0000-4000-8000-000000000001';

    it('starts every turn knowing the remembered facts, by ref and never by id', async () => {
        const chat = new Conversation();
        const model = new ScriptedModel(['Es la doctora Rojas.']);
        await runAssistantTurn(
            { actorUserId: BENCH_ACTOR, text: '¿cómo se llama mi dentista?', timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: chat.history },
            { data: chat.world, model },
        );
        expect(systemText(model)).toContain('m1 — Mi dentista es la doctora Rojas, en Providencia.');
        expect(systemText(model)).not.toContain(FACT_ID);
    });

    it('forgets a fact only after the user confirms, and stops showing it', async () => {
        const chat = new Conversation();
        const proposal = await chat.say('olvida lo del dentista', [[['propose_forget', { ref: 'm1' }]], '¿Lo olvido?']);
        expect(toolResults(proposal)[0]).toMatchObject({ status: 'waiting_for_user_confirmation' });
        expect(toolResults(proposal)[0].summary).toContain('Olvidar: «Mi dentista es la doctora Rojas');
        expect(chat.world.forgotten).toEqual([]);

        await chat.say('sí', [[['confirm_action', { action: 'a1' }]], 'Listo, lo olvidé.']);
        expect(chat.world.forgotten).toEqual([FACT_ID]);

        const model = new ScriptedModel(['No lo sé.']);
        await runAssistantTurn(
            { actorUserId: BENCH_ACTOR, text: '¿y mi dentista?', timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: chat.history },
            { data: chat.world, model },
        );
        expect(systemText(model)).not.toContain('Rojas');
    });

    it('cannot forget a fact the conversation never showed', async () => {
        const chat = new Conversation();
        const output = await chat.say('olvida todo', [[['propose_forget', { ref: 'm7' }]], 'No encontré eso.']);
        expect(toolResults(output)[0]).toMatchObject({ error: 'unknown_ref' });
        expect(chat.world.pending.size).toBe(0);
    });

    it('search results carry refs that can be forgotten', async () => {
        const chat = new Conversation();
        const output = await chat.say('¿qué sabes de mi dentista?', [[['search_memory', { query: 'dentista' }]], 'Es la doctora Rojas.']);
        expect(toolResults(output)[0].facts[0]).toEqual({ ref: 'm1', fact: 'Mi dentista es la doctora Rojas, en Providencia.' });
    });

    it('answers normally when the facts cannot be loaded', async () => {
        const world = new BenchWorld();
        world.listKnownFacts = async () => { throw new Error('db down'); };
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const output = await runAssistantTurn(
            { actorUserId: BENCH_ACTOR, text: 'hola', timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: { turns: [], refs: [], actions: [] } },
            { data: world, model: new ScriptedModel(['Hola.']) },
        );
        warn.mockRestore();
        expect(output.answer).toBe('Hola.');
    });
});

describe('M9 assistant helpers', () => {
    beforeEach(() => {
        clearAssistantHistoryCacheForTests();
        vi.mocked(listAgentConversationTurns).mockReset();
    });

    it('refs are stable per entity and resolve only by kind', () => {
        const refs = new AssistantRefTable();
        expect(refs.refFor('commitment', 'x', 'X')).toBe('c1');
        expect(refs.refFor('commitment', 'y', 'Y')).toBe('c2');
        expect(refs.refFor('commitment', 'x', 'X2')).toBe('c1');
        expect(refs.refFor('person', 'x', 'Ana')).toBe('p1');
        expect(refs.resolve(' C1 ', 'commitment')?.id).toBe('x');
        expect(refs.resolve('c1', 'person')).toBeNull();
        expect(new AssistantRefTable(refs.toJSON()).refFor('commitment', 'z', 'Z')).toBe('c3');
    });

    it('converts local Santiago times and day ranges', () => {
        expect(localDateTimeToIso('2026-11-03T16:00', 'America/Santiago')).toBe('2026-11-03T19:00:00.000Z');
        expect(localDateTimeToIso('2026-02-30T16:00', 'America/Santiago')).toBeNull();
        expect(localDayRangeToIso('2026-10-31', '2026-10-31', 'America/Santiago')).toEqual({
            from: '2026-10-31T03:00:00.000Z', to: '2026-11-01T03:00:00.000Z',
        });
        expect(describeLocal('2026-11-03T19:00:00.000Z', 'America/Santiago')).toContain('3 de noviembre');
    });

    it('maps history to Responses input items', () => {
        const items = toResponsesInput([
            { role: 'system', content: 's' },
            { role: 'user', content: 'u' },
            { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'list_proposals', arguments: '{}' } }] },
            { role: 'tool', tool_call_id: 't1', content: '{}' },
            { role: 'assistant', content: 'a' },
        ]);
        expect(items).toEqual([
            { role: 'developer', content: 's' },
            { role: 'user', content: 'u' },
            { type: 'function_call', call_id: 't1', name: 'list_proposals', arguments: '{}' },
            { type: 'function_call_output', call_id: 't1', output: '{}' },
            { role: 'assistant', content: 'a' },
        ]);
    });

    it('compacts long tool results before persisting', () => {
        const memory = compactAssistantMemory({
            version: 1, refs: [], actions: [],
            messages: [{ role: 'tool', tool_call_id: 't', content: 'x'.repeat(5000) }, { role: 'assistant', content: 'y'.repeat(5000) }],
        });
        expect((memory.messages[0] as { content: string }).content.length).toBe(1501);
        expect((memory.messages[1] as { content: string }).content.length).toBe(5000);
    });

    it('loads only assistant turns of the same dialogue scope', async () => {
        const memory = (text: string, ref: string) => ({
            version: 1, refs: [{ ref, kind: 'commitment', id: ref, label: ref }], actions: [],
            messages: [{ role: 'user', content: text }, { role: 'assistant', content: 'ok' }],
        });
        vi.mocked(listAgentConversationTurns).mockResolvedValueOnce([
            { result: { kind: 'response', __pingAgentHistory: { dialogueConversationId: null, assistant: memory('uno', 'c1') } } },
            { result: { kind: 'response', __pingAgentHistory: { dialogueConversationId: 'other', assistant: memory('otro', 'c9') } } },
            { result: { kind: 'response', __pingAgentHistory: { dialogueConversationId: null } } },
            { result: { kind: 'response', __pingAgentHistory: { dialogueConversationId: null, assistant: memory('dos', 'c2') } } },
            { result: { kind: 'response', __pingAgentHistory: { dialogueConversationId: 'self-chat', assistant: memory('tres', 'c3') } } },
        ] as any);
        // Unscoped rows predate the shared scope and belong to the self-chat.
        const history = await loadAssistantHistory(BENCH_ACTOR, 'self-chat', 'self-chat');
        expect(history.turns.map((turn) => (turn[0] as { content: string }).content)).toEqual(['uno', 'dos', 'tres']);
        expect(history.refs.map((entry) => entry.ref)).toEqual(['c3']);
        expect(vi.mocked(listAgentConversationTurns)).toHaveBeenCalledWith(BENCH_ACTOR, 'self-chat', 20, { includeAssistantMemory: true });
        expect(await loadAssistantHistory(BENCH_ACTOR, undefined, undefined)).toEqual({ turns: [], refs: [], actions: [] });
    });

    it('the next turn reads the previous one from memory until the history is cleared', async () => {
        vi.mocked(listAgentConversationTurns).mockResolvedValue([] as any);
        const world = new BenchWorld();
        const turn = (text: string, steps: Step[]) => runAssistantModeTurn(
            { actorUserId: BENCH_ACTOR, text, historyConversationId: 'self-chat', dialogueConversationId: 'chat-1' },
            { model: new ScriptedModel(steps), data: world, now: new Date(BENCH_NOW) },
        );
        await turn('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        expect(vi.mocked(listAgentConversationTurns)).toHaveBeenCalledTimes(1);

        const yes = await turn('sí', [[['confirm_action', { action: 'a1' }]], 'Hecho.']);
        expect(vi.mocked(listAgentConversationTurns)).toHaveBeenCalledTimes(1);
        expect(yes.memory.actions[0].state).toBe('confirmed');
        expect(world.executed).toHaveLength(1);

        expect((await loadAssistantHistory(BENCH_ACTOR, 'self-chat', 'other-scope')).turns).toHaveLength(0);
        forgetAssistantHistory(BENCH_ACTOR, 'self-chat');
        expect((await loadAssistantHistory(BENCH_ACTOR, 'self-chat', 'chat-1')).turns).toHaveLength(0);
        expect(vi.mocked(listAgentConversationTurns)).toHaveBeenCalledTimes(3);
    });
});

describe('M9 assistant — Confirm/Cancel buttons', () => {
    beforeEach(() => {
        clearAssistantHistoryCacheForTests();
        vi.mocked(listAgentConversationTurns).mockReset();
        vi.mocked(listAgentConversationTurns).mockResolvedValue([] as any);
    });

    const setup = () => {
        const world = new BenchWorld();
        const turn = (text: string, steps: Step[], actionDecision?: { action: string; decision: 'confirm' | 'discard' }) => runAssistantModeTurn(
            { actorUserId: BENCH_ACTOR, text, historyConversationId: 'self-chat', dialogueConversationId: 'chat-1', actionDecision },
            { model: new ScriptedModel(steps), data: world, now: new Date(BENCH_NOW) },
        );
        return { world, turn };
    };

    it('returns the action proposed in this turn, and only then', async () => {
        const { turn } = setup();
        const proposal = await turn('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        expect(proposal.result.pendingActions).toEqual([{ ref: 'a1', summary: proposal.memory.actions[0].summary }]);
        const aside = await turn('¿y qué hora es?', ['Son las 10.']);
        expect(aside.result.pendingActions).toBeUndefined();
    });

    it('Confirm executes the pending action once, without the model, and the conversation remembers it', async () => {
        const { world, turn } = setup();
        await turn('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        const model = new ScriptedModel([]);
        const pressed = await runAssistantModeTurn(
            { actorUserId: BENCH_ACTOR, text: 'Confirmar', historyConversationId: 'self-chat', dialogueConversationId: 'chat-1', actionDecision: { action: 'a1', decision: 'confirm' } },
            { model, data: world, now: new Date(BENCH_NOW) },
        );
        expect(model.seen).toHaveLength(0);
        expect(world.executed).toHaveLength(1);
        expect(pressed.memory.actions[0].state).toBe('confirmed');
        expect(pressed.result.response.answer).toMatch(/^Listo\. /);
        expect(pressed.result.pendingActions).toBeUndefined();
        expect(pressed.result.changed).toBe(true);
        expect(pressed.memory.messages.map((message) => message.role)).toEqual(['user', 'assistant', 'tool', 'assistant']);

        const twice = await turn('Confirmar', [], { action: 'a1', decision: 'confirm' });
        expect(world.executed).toHaveLength(1);
        expect(twice.result.changed).toBeUndefined();
        expect(twice.result.response.answer).toBe('Esa propuesta ya no está pendiente; no hice ningún cambio.');
    });

    it('Cancel discards it; a superseded or unknown action changes nothing', async () => {
        const { world, turn } = setup();
        await turn('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        const cancelled = await turn('Cancelar', [], { action: 'a1', decision: 'discard' });
        expect(cancelled.memory.actions[0].state).toBe('discarded');
        expect(cancelled.result.response.answer).toBe('Listo, no hice ningún cambio.');

        await turn('completa la llamada', [[LIST_TODAY], [['propose_complete', { ref: 'c1', note: null }]], '¿Confirmas?']);
        await turn('mejor la de Ana', [[LIST_TODAY], [['propose_complete', { ref: 'c2', note: null }]], '¿Confirmas?']);
        const stale = await turn('Confirmar', [], { action: 'a2', decision: 'confirm' });
        const unknown = await turn('Confirmar', [], { action: 'a99', decision: 'confirm' });
        expect(stale.result.response.answer).toBe('Esa propuesta ya no está pendiente; no hice ningún cambio.');
        expect(unknown.result.response.answer).toBe('Esa propuesta ya no está pendiente; no hice ningún cambio.');
        expect(world.executed).toHaveLength(0);
    });
});
