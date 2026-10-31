// M9 assistant — offline tests. A scripted model stands in for the provider,
// so these check the safety contract of the tools and the loop, not language.
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/agentConversationTurn.service', () => ({
    listAgentConversationTurns: vi.fn(),
}));

import { listAgentConversationTurns } from '../src/services/agentConversationTurn.service';
import { runAssistantTurn } from '../src/services/assistant/assistantService';
import { AssistantRefTable } from '../src/services/assistant/assistantRefs';
import { describeLocal, localDateTimeToIso, localDayRangeToIso } from '../src/services/assistant/assistantTime';
import { compactAssistantMemory, loadAssistantHistory } from '../src/services/assistant/assistantTurn.service';
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

    async say(text: string, steps: Step[]): Promise<AssistantTurnOutput> {
        const output = await runAssistantTurn(
            { actorUserId: BENCH_ACTOR, text, timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history: this.history },
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
});

describe('M9 assistant helpers', () => {
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
        ] as any);
        const history = await loadAssistantHistory(BENCH_ACTOR, 'self-chat', undefined);
        expect(history.turns.map((turn) => (turn[0] as { content: string }).content)).toEqual(['uno', 'dos']);
        expect(history.refs.map((entry) => entry.ref)).toEqual(['c2']);
        expect(vi.mocked(listAgentConversationTurns)).toHaveBeenCalledWith(BENCH_ACTOR, 'self-chat', 20, { includeAssistantMemory: true });
        expect(await loadAssistantHistory(BENCH_ACTOR, undefined, undefined)).toEqual({ turns: [], refs: [], actions: [] });
    });
});
