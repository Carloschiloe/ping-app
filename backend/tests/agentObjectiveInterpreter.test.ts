import { describe, expect, it, vi } from 'vitest';
import {
    DeterministicObjectiveInterpreter,
    LlmObjectiveInterpreter,
    type AgentObjectiveModel,
} from '../src/services/agentObjectiveInterpreter.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CTX = { actorUserId: ACTOR };

describe('DeterministicObjectiveInterpreter: clasificación (sección 7 del ticket M-3)', () => {
    const interpreter = new DeterministicObjectiveInterpreter();

    it('"Dile a Alejandra que llegaré tarde." -> communicate_message, personHints=[Alejandra]', async () => {
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect(obj.objectiveType).toBe('communicate_message');
        expect(obj.targetEntities.personHints).toContain('Alejandra');
        expect(obj.source).toBe('deterministic');
    });

    it('"Agenda entrenar mañana a las 8." -> create_commitment_or_proposal, timeHint presente', async () => {
        const obj = await interpreter.interpret('Agenda entrenar mañana a las 8.', CTX);
        expect(obj.objectiveType).toBe('create_commitment_or_proposal');
        expect(obj.timeConstraints.rawHint).toBeTruthy();
    });

    it('"Mueve Entrenar al viernes." -> reschedule_existing_commitment, entityHint=Entrenar, timeHint=viernes', async () => {
        const obj = await interpreter.interpret('Mueve Entrenar al viernes.', CTX);
        expect(obj.objectiveType).toBe('reschedule_existing_commitment');
        expect(obj.targetEntities.entityHints[0]).toMatch(/entrenar/i);
        expect(obj.timeConstraints.rawHint).toMatch(/viernes/i);
    });

    it('"Recuérdame comprar pan" -> create_personal_commitment', async () => {
        const obj = await interpreter.interpret('Recuérdame comprar pan', CTX);
        expect(obj.objectiveType).toBe('create_personal_commitment');
    });

    it('"Pregunta a Alejandra si puede el viernes" -> communicate_and_wait', async () => {
        const obj = await interpreter.interpret('Pregunta a Alejandra si puede el viernes', CTX);
        expect(obj.objectiveType).toBe('communicate_and_wait');
        expect(obj.targetEntities.personHints).toContain('Alejandra');
    });

    it('"Completa Entrenar." -> complete_existing_commitment', async () => {
        const obj = await interpreter.interpret('Completa Entrenar.', CTX);
        expect(obj.objectiveType).toBe('complete_existing_commitment');
        expect(obj.targetEntities.entityHints[0]).toMatch(/entrenar/i);
    });

    it('"Rechaza Entrenar por mí." -> respond_to_existing_proposal, decisionHint=reject', async () => {
        const obj = await interpreter.interpret('Rechaza Entrenar por mí.', CTX);
        expect(obj.objectiveType).toBe('respond_to_existing_proposal');
        expect(obj.constraints.decisionHint).toBe('reject');
    });

    it('"Avísale a Alejandra y Pedro." -> communicate_message con dos personHints', async () => {
        const obj = await interpreter.interpret('Avísale a Alejandra y Pedro.', CTX);
        expect(obj.objectiveType).toBe('communicate_message');
        expect(obj.targetEntities.personHints).toEqual(['Alejandra', 'Pedro']);
    });

    it('"Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo." -> communicate_and_wait con follow-up de creación', async () => {
        const obj = await interpreter.interpret('Pregúntale a Alejandra si puede el viernes y si acepta, agéndalo.', CTX);
        expect(obj.objectiveType).toBe('communicate_and_wait');
        expect((obj as any).__followUp).toBe('create_commitment_or_proposal');
    });

    it('una frase sin ningún verbo/patrón reconocido -> unsupported, nunca inventa una acción', async () => {
        const obj = await interpreter.interpret('El clima está agradable hoy.', CTX);
        expect(obj.objectiveType).toBe('unsupported');
    });

    it('entidad ausente en un verbo de reschedule produce una ambigüedad bloqueante, nunca un plan silencioso', async () => {
        const obj = await interpreter.interpret('Mueve.', CTX);
        expect(obj.ambiguities.some((a) => a.kind === 'blocking')).toBe(true);
    });
});

describe('REPEATED PLAN DETERMINISM (sección 43): mismo input -> mismo objectiveType/hints estructuralmente', () => {
    const interpreter = new DeterministicObjectiveInterpreter();
    it('10 corridas del mismo texto producen objectiveType/personHints/entityHints idénticos', async () => {
        const results = await Promise.all(Array.from({ length: 10 }, () => interpreter.interpret('Mueve Entrenar al viernes.', CTX)));
        const first = results[0];
        for (const r of results) {
            expect(r.objectiveType).toBe(first.objectiveType);
            expect(r.targetEntities.entityHints).toEqual(first.targetEntities.entityHints);
            expect(r.timeConstraints.rawHint).toBe(first.timeConstraints.rawHint);
        }
    });
});

// ─── Provider abstraction (sección 49): fake model, cero red ────────────────
function fakeModel(response: string | (() => Promise<string>)): AgentObjectiveModel {
    return { modelName: 'fake-objective-model', interpret: vi.fn(async () => (typeof response === 'string' ? response : response())) };
}
function throwingModel(): AgentObjectiveModel {
    return { modelName: 'fake-throwing', interpret: vi.fn(async () => { throw new Error('simulated api_error'); }) };
}
function hangingModel(delayMs: number): AgentObjectiveModel {
    return { modelName: 'fake-hanging', interpret: () => new Promise((resolve) => setTimeout(() => resolve('{}'), delayMs)) };
}

describe('LlmObjectiveInterpreter: fallback determinístico ante cualquier fallo del proveedor (sección 49, nunca red real)', () => {
    it('un modelo válido produce un objective con source="llm"', async () => {
        const model = fakeModel(JSON.stringify({ objectiveType: 'communicate_message', personHints: ['Alejandra'], entityHints: [], timeHint: null, decisionHint: null, draftOnly: false, responsibleHint: null, followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: 'Llegaré tarde' }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect(obj.source).toBe('llm');
        expect(obj.objectiveType).toBe('communicate_message');
        expect(obj.modelUsed).toBe('fake-objective-model');
    });

    it('un modelo que lanza error cae al determinístico con fallbackReason="api_error"', async () => {
        const interpreter = new LlmObjectiveInterpreter({ model: throwingModel() });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect(obj.source).toBe('llm_fallback');
        expect(obj.fallbackReason).toBe('api_error');
        expect(obj.objectiveType).toBe('communicate_message'); // el determinístico igual lo resuelve
    });

    it('un modelo que se cuelga (timeout) cae al determinístico con fallbackReason="timeout"', async () => {
        const interpreter = new LlmObjectiveInterpreter({ model: hangingModel(50), timeoutMs: 5 });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect(obj.fallbackReason).toBe('timeout');
    });

    it('un modelo que devuelve JSON inválido cae al determinístico con fallbackReason="invalid_json"', async () => {
        const interpreter = new LlmObjectiveInterpreter({ model: fakeModel('not json at all') });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect(obj.fallbackReason).toBe('invalid_json');
    });

    it('un modelo que devuelve un objectiveType inventado cae al determinístico con fallbackReason="schema_invalid" (nunca acepta un tipo fuera del enum)', async () => {
        const interpreter = new LlmObjectiveInterpreter({ model: fakeModel(JSON.stringify({ objectiveType: 'delete_everything' })) });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect(obj.fallbackReason).toBe('schema_invalid');
    });

    it('el modelo nunca puede inyectar un toolId/personId — el schema strip descarta cualquier campo no declarado', async () => {
        const injected = JSON.stringify({
            objectiveType: 'communicate_message', personHints: ['Alejandra'],
            toolId: 'send_message', personId: '11111111-1111-4111-8111-111111111111', // campos no declarados
        });
        const interpreter = new LlmObjectiveInterpreter({ model: fakeModel(injected) });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde.', CTX);
        expect((obj as any).toolId).toBeUndefined();
        expect((obj as any).personId).toBeUndefined();
    });
});
