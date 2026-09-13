import { describe, expect, it, vi } from 'vitest';
import {
    DeterministicObjectiveInterpreter,
    LlmObjectiveInterpreter,
    extractExplicitTitle,
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

// PING — CREATE_COMMITMENT TITLE FIDELITY FIX. Physical iPhone failure:
// "Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping"
// planned/created a commitment literally titled "un compromiso" -- the
// user's explicit title was silently discarded.
//
// ROOT CAUSE (proven, not guessed): extractEntityHint (the ONLY title
// extraction that existed) grabs everything between the verb and the
// FIRST known stop word (ENTITY_STOP_MARKER includes "para"/"a las"/
// "hoy"/etc.). For "Crea un compromiso para hoy a las 18:30 que se llame
// prueba caché Ping", afterVerb=" un compromiso para hoy a las 18:30 que
// se llame prueba caché Ping" -- the stop marker "para" truncates
// EVERYTHING after it, so "que se llame prueba caché Ping" was never even
// reached. The leftover prefix, "un compromiso", survived untouched
// because the article-strip only covers "el compromiso de"/"la"/"el",
// never the indefinite article "un". This is the FIRST stage where the
// title is lost -- confirmed by direct reproduction of extractEntityHint's
// exact regex behavior outside the module before writing any fix.
//
// LlmObjectiveInterpreter is the PRIMARY path in production (the
// deterministic interpreter above is only its fallback on timeout/error/
// invalid JSON) -- its prompt asked only for "an entity name as written"
// with zero guidance that an explicit marker must dominate a generic noun,
// so it plausibly produced entityHints: ["un compromiso"] directly,
// independent of the deterministic bug. This is also why existing
// automated tests never caught it: every prior interpreter test used a
// bare activity word ("entrenar") with no generic-noun-plus-explicit-
// marker combination, and no test exercised "que se llame X"/"llamado X"/
// "con nombre X"/"titulado X"/quoted titles at all.
//
// FIX (single canonical owner, reused everywhere, never duplicated):
// extractExplicitTitle(text) — a new deterministic function in
// agentObjectiveInterpreter.service.ts (the interpreter that already owned
// all title/entity-hint extraction) — recognizes the four marker forms
// plus quoted titles against the FULL raw text and, when found, overrides
// entityHints[0]. It is applied in exactly two places: (1) inside
// DeterministicObjectiveInterpreter's create_commitment_or_proposal/
// create_personal_commitment branches, and (2) inside mapPayloadToObjective
// (the LLM payload consumer), using the SAME discipline already
// established for verbatimMessageHint — the LLM proposes, Core
// independently re-derives and overrides from the real source text before
// trusting it. agentPlanner.service.ts (planCreateCommitment and the two
// other entityHints[0] call sites) was intentionally left untouched: it
// already correctly trusts objective.targetEntities.entityHints[0]
// verbatim — the fix belongs upstream, at the single point both
// interpreters funnel through, never spread across the planner too.
describe('PING — CREATE_COMMITMENT TITLE FIDELITY FIX: extractExplicitTitle recognizes every marker form', () => {
    it('"que se llame X" -> X', () => {
        expect(extractExplicitTitle('un compromiso para hoy a las 18:30 que se llame prueba caché Ping')).toBe('prueba caché Ping');
    });
    it('"llamado X" -> X, stopping before a trailing date phrase', () => {
        expect(extractExplicitTitle('un compromiso llamado comprar alimento mañana a las 10')).toBe('comprar alimento');
    });
    it('"con nombre X" -> X, stopping before a trailing date phrase', () => {
        expect(extractExplicitTitle('una tarea con nombre llamar a Pedro mañana')).toBe('llamar a Pedro');
    });
    it('"titulado/titulada X" -> X, stopping before a trailing date phrase', () => {
        expect(extractExplicitTitle('una reunión titulada revisión semanal el viernes a las 9')).toBe('revisión semanal');
    });
    it('a quoted title -> the exact text inside the quotes, never including the surrounding verb/date', () => {
        expect(extractExplicitTitle('Crea "Ir al gimnasio" para hoy a las 19')).toBe('Ir al gimnasio');
    });
    it('a generic noun BEFORE the explicit marker never wins -- the explicit title always dominates', () => {
        const result = extractExplicitTitle('Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping');
        expect(result).toBe('prueba caché Ping');
        expect(result).not.toBe('un compromiso');
        expect(result).not.toMatch(/^(un |una )?compromiso$/i);
    });
    it('no explicit marker present -> null (caller must fall back to the generic extractor, never invent a title here)', () => {
        expect(extractExplicitTitle('Agenda entrenar mañana a las 8')).toBeNull();
    });
    it('accents/case are preserved verbatim, not normalized away', () => {
        expect(extractExplicitTitle('crea un compromiso llamado Última Revisión Técnica')).toBe('Última Revisión Técnica');
    });
    it('whitespace is trimmed, but internal wording is never altered', () => {
        expect(extractExplicitTitle('crea algo que se llame   prueba caché Ping   ')).toBe('prueba caché Ping');
    });
});

describe('PING — CREATE_COMMITMENT TITLE FIDELITY FIX: DeterministicObjectiveInterpreter propagates the explicit title into entityHints[0]', () => {
    const interpreter = new DeterministicObjectiveInterpreter();

    // The exact real physical fixture from the ticket -- must NEVER regress
    // to "un compromiso" again.
    it('REAL PHYSICAL FIXTURE: "Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping" -> entityHints[0] === "prueba caché Ping", never "un compromiso"', async () => {
        const obj = await interpreter.interpret('Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping', CTX);
        expect(obj.objectiveType).toBe('create_commitment_or_proposal');
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
        expect(obj.targetEntities.entityHints[0]).not.toBe('un compromiso');
        expect(obj.timeConstraints.rawHint).toBeTruthy();
    });

    it('"Crea un compromiso llamado comprar alimento mañana a las 10" -> title "comprar alimento", timeHint present', async () => {
        const obj = await interpreter.interpret('Crea un compromiso llamado comprar alimento mañana a las 10', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('comprar alimento');
        expect(obj.timeConstraints.rawHint).toBeTruthy();
    });

    it('"Crea una tarea con nombre llamar a Pedro mañana" -> title "llamar a Pedro"', async () => {
        const obj = await interpreter.interpret('Crea una tarea con nombre llamar a Pedro mañana', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('llamar a Pedro');
    });

    it('"Crea una reunión titulada revisión semanal el viernes a las 9" -> title "revisión semanal"', async () => {
        const obj = await interpreter.interpret('Crea una reunión titulada revisión semanal el viernes a las 9', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('revisión semanal');
    });

    it('\'Crea "Ir al gimnasio" para hoy a las 19\' -> title "Ir al gimnasio"', async () => {
        const obj = await interpreter.interpret('Crea "Ir al gimnasio" para hoy a las 19', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('Ir al gimnasio');
    });

    it('"Agenda para mañana a las 8 revisar informe" (no explicit title, meaningful content trails the date) -> natural derived title "revisar informe", never a blocking ambiguity when meaningful content exists', async () => {
        const obj = await interpreter.interpret('Agenda para mañana a las 8 revisar informe', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('revisar informe');
        expect(obj.ambiguities.some((a) => a.kind === 'blocking')).toBe(false);
    });

    it('"Agenda entrenar mañana a las 8." still extracts "entrenar" unchanged -- the suffix-fallback path never activates when a valid prefix title already exists (no regression)', async () => {
        const obj = await interpreter.interpret('Agenda entrenar mañana a las 8.', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('entrenar');
    });

    it('"Recuérdame algo llamado pagar la luz mañana" (create_personal_commitment) -> explicit title also dominates here', async () => {
        const obj = await interpreter.interpret('Recuérdame algo llamado pagar la luz mañana', CTX);
        expect(obj.objectiveType).toBe('create_personal_commitment');
        expect(obj.targetEntities.entityHints[0]).toBe('pagar la luz');
    });

    it('title case/accents are preserved reasonably through the full interpret() call, not just the raw extractor', async () => {
        const obj = await interpreter.interpret('Crea un compromiso llamado Última Revisión Técnica mañana', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('Última Revisión Técnica');
    });

    it('genuinely no meaningful title anywhere -> still a blocking ambiguity, never an invented generic title (safe existing fallback preserved)', async () => {
        const obj = await interpreter.interpret('Crea para mañana a las 8', CTX);
        expect(obj.ambiguities.some((a) => a.kind === 'blocking' && a.field === 'title')).toBe(true);
        expect(obj.targetEntities.entityHints).toEqual([]);
    });
});

describe('PING — CREATE_COMMITMENT TITLE FIDELITY FIX: LlmObjectiveInterpreter also overrides a generic-noun entityHints[0] proposed by the model', () => {
    it('model proposes entityHints=["un compromiso"] (reproducing the exact physical failure) -- Core overrides it with the explicit title re-derived from the real source text', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'create_commitment_or_proposal',
            personHints: [], entityHints: ['un compromiso'], timeHint: 'hoy a las 18:30',
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping', CTX);
        expect(obj.source).toBe('llm');
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
        expect(obj.targetEntities.entityHints[0]).not.toBe('un compromiso');
    });

    it('model already proposes the correct explicit title -- override is a no-op, never double-processed or corrupted', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'create_commitment_or_proposal',
            personHints: [], entityHints: ['prueba caché Ping'], timeHint: 'hoy a las 18:30',
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('no explicit marker in the source text -- the model\'s own entityHints proposal is trusted unchanged (override never fires without a real marker)', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'create_commitment_or_proposal',
            personHints: [], entityHints: ['entrenar'], timeHint: 'mañana a las 8',
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Agenda entrenar mañana a las 8', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('entrenar');
    });

    it('the override only applies to create_commitment_or_proposal/create_personal_commitment -- a reschedule/complete/respond objectiveType with an explicit-title-shaped phrase is never touched (entityHints there means an EXISTING entity reference, not a new title)', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'reschedule_existing_commitment',
            personHints: [], entityHints: ['un compromiso'], timeHint: 'el viernes',
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Mueve un compromiso que se llame prueba caché Ping al viernes', CTX);
        // El override NUNCA se aplica a este objectiveType -- se deja el
        // hint del modelo tal cual, incluso si "coincidentemente" es
        // genérico; resolver una entidad EXISTENTE es responsabilidad del
        // planner/retrieval, no de este extractor de títulos nuevos.
        expect(obj.targetEntities.entityHints[0]).toBe('un compromiso');
    });
});
