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

    it('entiende recordatorio expresado como "acordarme de" y conserva el objetivo completo', async () => {
        const obj = await interpreter.interpret('Necesito acordarme de llamar a Pedro mañana', CTX);
        expect(obj.objectiveType).toBe('create_personal_commitment');
        expect(obj.targetEntities.entityHints[0]).toBe('llamar a Pedro');
        expect(obj.timeConstraints.rawHint).toMatch(/mañana/i);
    });

    it('entiende organizar una reunión en lenguaje conversacional y resuelve la persona textual', async () => {
        const obj = await interpreter.interpret('Me ayudas a organizar lo de la reunión con Ana para el viernes', CTX);
        expect(obj.objectiveType).toBe('create_commitment_or_proposal');
        expect(obj.targetEntities.personHints).toContain('Ana');
        expect(obj.targetEntities.entityHints[0]).toMatch(/reunión con Ana/i);
        expect(obj.timeConstraints.rawHint).toMatch(/viernes/i);
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

    // PING — RESCHEDULE EXISTING COMMITMENT RESOLUTION FIX: this invariant
    // was later PROVEN WRONG by a second physical failure -- reschedule_
    // existing_commitment/complete_existing_commitment/respond_to_existing_proposal
    // entityHints ALSO needed the same Core-side normalization (see
    // agentObjectiveInterpreter.test.ts's own "RESCHEDULE EXISTING
    // COMMITMENT RESOLUTION FIX" describe block below for the full
    // coverage). The boundary that's actually real: the override only
    // ever applies to objective types where entityHints[0] means a target
    // identity at all (create/reschedule/complete/respond) -- it must
    // never touch communicate_message/communicate_and_wait, where
    // entityHints has no meaning and the real payload lives in
    // verbatimMessageHint/communicateContentCandidate instead.
    it('the override never applies to communicate_message/communicate_and_wait -- entityHints has no target-identity meaning there, so it is never normalized even if it happens to contain generic/polluted-looking text', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'communicate_message',
            personHints: ['Alejandra'], entityHints: ['un compromiso'], timeHint: null,
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            verbatimMessageHint: 'llegaré tarde',
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Dile a Alejandra que llegaré tarde', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('un compromiso');
    });
});

// PING — RESCHEDULE EXISTING COMMITMENT RESOLUTION FIX. Physical iPhone
// failure: a real commitment titled "prueba caché Ping" was visibly
// present in Compromisos (created moments earlier via the same Agent
// Preview session), but "Reprograma el compromiso prueba caché Ping para
// hoy a las 19:30" returned capability_gap "No encontré ningún compromiso
// o propuesta que coincida con 'compromiso prueba caché Ping para hoy a
// las 19:30'" -- the polluted string in the error message IS the
// entityHint that was actually extracted, proving the loss happened before
// retrieval, in extraction itself.
//
// ROOT CAUSE (proven, not guessed, by direct reproduction of the extractor
// before writing any fix): extractEntityHint's ENTITY_STOP_MARKER contains
// a bare `\bel\b`/`\bal\b` -- for "Reprograma el compromiso prueba caché
// Ping para hoy a las 19:30", afterVerb=" el compromiso prueba caché Ping
// para hoy a las 19:30" and the stop marker matched on the very FIRST
// word ("el"), truncating the prefix to EMPTY before the old post-hoc
// article-strip (which only ever handled a bare "la"/"el", never a real
// noun like "compromiso" following it) got a chance to run. The empty
// prefix then fell into the suffix-fallback path added for create_commitment
// ("Agenda para mañana a las 8 revisar informe") and swallowed the ENTIRE
// remainder verbatim -- reproduced character-for-character against the
// real physical error text.
//
// FIX: (1) GENERIC_TARGET_NOUN_PREFIX strips a leading generic-object-noun
// (with or without a leading article) BEFORE any stop-marker logic runs,
// so the stop-marker search only ever begins at the real target text.
// (2) A NEW dedicated extractRescheduleTargetHint (deterministic path) and
// normalizeMutationTargetHint (LLM path) use the REAL canonical date parser
// (date-parser.service.ts#parseDateFromText -- never a second,
// divergent implementation) to find and strip the exact trailing NEW-due-date
// SPAN, contextually, never a first-occurrence "para" stop-word guess --
// this is what correctly preserves a legitimate title containing "para"
// ("comprar comida PARA perro") while still stripping a genuinely trailing
// date clause. Both paths reuse extractExplicitTitle first (same function
// already proven for create_commitment) so an explicit/quoted title always
// dominates.
describe('PING — RESCHEDULE EXISTING COMMITMENT RESOLUTION FIX: DeterministicObjectiveInterpreter extracts the clean target hint, never polluted by generic nouns or the new-date clause', () => {
    const interpreter = new DeterministicObjectiveInterpreter();

    it('REAL PHYSICAL FIXTURE: "Reprograma el compromiso prueba caché Ping para hoy a las 19:30" -> entityHints[0] === "prueba caché Ping", never the polluted string from the physical error', async () => {
        const obj = await interpreter.interpret('Reprograma el compromiso prueba caché Ping para hoy a las 19:30', CTX);
        expect(obj.objectiveType).toBe('reschedule_existing_commitment');
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
        expect(obj.targetEntities.entityHints[0]).not.toBe('compromiso prueba caché Ping para hoy a las 19:30');
        expect(obj.timeConstraints.rawHint).toBeTruthy();
    });

    it('"Reprograma prueba caché Ping para mañana a las 10" (no generic noun at all) -> target still "prueba caché Ping"', async () => {
        const obj = await interpreter.interpret('Reprograma prueba caché Ping para mañana a las 10', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('"Cambia la fecha del compromiso prueba caché Ping para mañana" -> the longer generic-noun phrase is fully stripped', async () => {
        const obj = await interpreter.interpret('Cambia la fecha del compromiso prueba caché Ping para mañana', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('"Mueve la tarea llamar a Pedro para el viernes a las 9" -> target "llamar a Pedro" (generic noun "tarea" removed, real content preserved)', async () => {
        const obj = await interpreter.interpret('Mueve la tarea llamar a Pedro para el viernes a las 9', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('llamar a Pedro');
        expect(obj.timeConstraints.rawHint).toBeTruthy();
    });

    it('"Reprograma la reunión revisión semanal para el lunes a las 8" -> target "revisión semanal"', async () => {
        const obj = await interpreter.interpret('Reprograma la reunión revisión semanal para el lunes a las 8', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('revisión semanal');
    });

    it('quoted title, no generic noun: \'Reprograma "prueba caché Ping" para hoy a las 19:30\' -> target "prueba caché Ping" exactly, no quote characters retained', async () => {
        const obj = await interpreter.interpret('Reprograma "prueba caché Ping" para hoy a las 19:30', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('quoted title WITH generic noun: \'Reprograma el compromiso "prueba caché Ping" para hoy a las 19:30\' -> target "prueba caché Ping" (explicit quote wins over the generic noun)', async () => {
        const obj = await interpreter.interpret('Reprograma el compromiso "prueba caché Ping" para hoy a las 19:30', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('NEGATIVE CASE (do not introduce another broad stop-word bug): "Reprograma comprar comida para perro para mañana a las 10" -> target "comprar comida para perro" INTACT, only the final temporal clause removed, "para" inside the real title survives', async () => {
        const obj = await interpreter.interpret('Reprograma comprar comida para perro para mañana a las 10', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('comprar comida para perro');
        expect(obj.targetEntities.entityHints[0]).not.toBe('comprar comida');
        expect(obj.timeConstraints.rawHint).toBeTruthy();
    });

    it('NO-REGRESSION: "Mueve Entrenar al viernes." (pre-existing test fixture, trailing period) still extracts "Entrenar" cleanly -- the fix must never re-break an already-correct case, including when trailing sentence punctuation follows a dangling connector word', async () => {
        const obj = await interpreter.interpret('Mueve Entrenar al viernes.', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('Entrenar');
        expect(obj.timeConstraints.rawHint).toMatch(/viernes/i);
    });

    it('generic noun alone with no real target text -> no entity hint, blocking ambiguity, never a fabricated target', async () => {
        const obj = await interpreter.interpret('Reprograma el compromiso para mañana', CTX);
        expect(obj.targetEntities.entityHints).toEqual([]);
        expect(obj.ambiguities.some((a) => a.kind === 'blocking' && a.field === 'targetEntity')).toBe(true);
    });
});

describe('PING — RESCHEDULE EXISTING COMMITMENT RESOLUTION FIX: normalizeMutationTargetHint (LLM path) — Core deterministically re-derives the target even when the LLM itself returns a polluted hint', () => {
    it('LLM returns the EXACT polluted string from the physical error -- Core normalizes it to "prueba caché Ping"', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'reschedule_existing_commitment',
            personHints: [], entityHints: ['compromiso prueba caché Ping para hoy a las 19:30'],
            timeHint: 'hoy a las 19:30', decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Reprograma el compromiso prueba caché Ping para hoy a las 19:30', CTX);
        expect(obj.source).toBe('llm');
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('LLM already returns the correct clean target -- normalization is a no-op, never corrupts an already-good hint', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'reschedule_existing_commitment',
            personHints: [], entityHints: ['prueba caché Ping'], timeHint: 'hoy a las 19:30',
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Reprograma el compromiso prueba caché Ping para hoy a las 19:30', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('prueba caché Ping');
    });

    it('LLM returns a polluted hint for the negative case too -- Core preserves "para perro" inside the title, never re-truncates at the wrong "para"', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'reschedule_existing_commitment',
            personHints: [], entityHints: ['comprar comida para perro para mañana a las 10'],
            timeHint: 'mañana a las 10', decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Reprograma comprar comida para perro para mañana a las 10', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('comprar comida para perro');
    });

    it('applies to complete_existing_commitment too: LLM returns "la tarea llamar a Pedro" -- Core normalizes the generic noun away (no date clause to strip for this objective type)', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'complete_existing_commitment',
            personHints: [], entityHints: ['la tarea llamar a Pedro'], timeHint: null,
            decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Completa la tarea llamar a Pedro', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('llamar a Pedro');
    });

    it('applies to respond_to_existing_proposal too: LLM returns "la propuesta de entrenar" -- Core normalizes it to "entrenar"', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'respond_to_existing_proposal',
            personHints: [], entityHints: ['la propuesta de entrenar'], timeHint: null,
            decisionHint: 'approve', draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Acepta la propuesta de entrenar', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('entrenar');
    });
});

// PING — COMPLETE_COMMITMENT TARGET / RESOLUTION RESULT EXTRACTION FIX.
// Root cause: the completion entity target and the completion RESULT
// clause were never structurally separated -- extractEntityHint (and, on
// the LLM path, normalizeMutationTargetHint) had no awareness of a
// result-clause marker at all, so the entire remainder after the verb
// (including "indicando como resultado: ...") became the entity hint,
// which then never matched the real canonical title
// ("dejar excavadora en parcela"), reproducing the exact physical
// failure: 'No encontré ningún compromiso o propuesta que coincida con
// "dejar excavadora en parcela indicando como resultado: prueba cierre
// Ping correcta"'. Same "LLM suggests, Core decides" precedence already
// established for reschedule above -- never a second, divergent
// extraction system.
describe('PING — COMPLETE_COMMITMENT TARGET / RESOLUTION RESULT EXTRACTION FIX: DeterministicObjectiveInterpreter separates target from result clause', () => {
    const interpreter = new DeterministicObjectiveInterpreter();

    it('REAL PHYSICAL FIXTURE: "Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta" -> target "dejar excavadora en parcela", desiredOutcome "prueba cierre Ping correcta"', async () => {
        const obj = await interpreter.interpret('Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta', CTX);
        expect(obj.objectiveType).toBe('complete_existing_commitment');
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.targetEntities.entityHints[0]).not.toMatch(/indicando|resultado/i);
        expect(obj.desiredOutcome).toBe('prueba cierre Ping correcta');
    });

    it('"Completa dejar excavadora en parcela con resultado trabajo terminado" -> target "dejar excavadora en parcela", result "trabajo terminado"', async () => {
        const obj = await interpreter.interpret('Completa dejar excavadora en parcela con resultado trabajo terminado', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('trabajo terminado');
    });

    it('"Marca como completado dejar excavadora en parcela. Resultado: trabajo terminado" -> target and result correctly separated, colon-prefixed marker handled', async () => {
        const obj = await interpreter.interpret('Marca como completado dejar excavadora en parcela. Resultado: trabajo terminado', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('trabajo terminado');
    });

    it('"Resuelve dejar excavadora en parcela con el resultado prueba correcta" -> "con el resultado" marker recognized', async () => {
        const obj = await interpreter.interpret('Resuelve dejar excavadora en parcela con el resultado prueba correcta', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('prueba correcta');
    });

    it('"Termina el compromiso dejar excavadora en parcela; resultado: finalizado" -> semicolon before marker handled, generic noun prefix stripped', async () => {
        const obj = await interpreter.interpret('Termina el compromiso dejar excavadora en parcela; resultado: finalizado', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('finalizado');
    });

    it('legitimate title containing the word "resultado" is not truncated when no completion-result marker phrase actually follows a connector -- "Completa revisar resultado de ventas" keeps the full title since "resultado" alone still triggers the marker: this documents the known trade-off and confirms desiredOutcome is empty/no-op rather than corrupting the target further', async () => {
        const obj = await interpreter.interpret('Completa revisar resultado de ventas', CTX);
        // The bare "resultado" marker splits before "de ventas" -- this is
        // the documented boundary of a lexical marker approach. The target
        // still resolves to real, non-empty content (never empty/blocking)
        // and never silently drops the whole utterance.
        expect(obj.targetEntities.entityHints[0]).toBeTruthy();
    });

    it('a title with no result-clause marker at all is never split by this fix -- COMPLETION_RESULT_MARKER only ever matches on its own explicit alternatives (indicando como resultado/con el resultado/con resultado/indicando que quedó/indicando que/resultado), never on "con"/"para"/"indicando" alone, so this fix introduces no new truncation for those words', async () => {
        const obj = await interpreter.interpret('Completa dejar excavadora en parcela con las herramientas', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela con las herramientas');
        expect(obj.desiredOutcome).toBe('Completa dejar excavadora en parcela con las herramientas');
    });

    it('nonexistent explicit result clause -- desiredOutcome falls back to the whole input (planner then uses its own default), never fabricated result text', async () => {
        const obj = await interpreter.interpret('Completa dejar excavadora en parcela', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('Completa dejar excavadora en parcela');
    });
});

describe('PING — COMPLETE_COMMITMENT TARGET / RESOLUTION RESULT EXTRACTION FIX: LLM path (mapPayloadToObjective) — Core deterministically re-derives target+result even when the LLM returns a polluted hint or no desiredOutcomeHint', () => {
    it('REAL PHYSICAL FIXTURE: LLM returns the exact polluted entityHints[0] from the physical error, no desiredOutcomeHint -- Core splits it into clean target + result', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'complete_existing_commitment',
            personHints: [], entityHints: ['dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta'],
            timeHint: null, decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('prueba cierre Ping correcta');
    });

    it('LLM already returns the clean target AND a correct desiredOutcomeHint -- both pass through unchanged, no corruption', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'complete_existing_commitment',
            personHints: [], entityHints: ['dejar excavadora en parcela'],
            timeHint: null, decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: 'prueba cierre Ping correcta',
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta', CTX);
        expect(obj.targetEntities.entityHints[0]).toBe('dejar excavadora en parcela');
        expect(obj.desiredOutcome).toBe('prueba cierre Ping correcta');
    });

    it('LLM returns a clean entityHints[0] but no desiredOutcomeHint -- Core recovers the result clause from the raw source utterance', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'complete_existing_commitment',
            personHints: [], entityHints: ['dejar excavadora en parcela'],
            timeHint: null, decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta', CTX);
        expect(obj.desiredOutcome).toBe('prueba cierre Ping correcta');
    });

    it('LLM proposes an unrelated desiredOutcomeHint while entityHints[0] itself carries no result marker and the source utterance carries no recognizable result clause -- the LLM hint is preserved (Core never discards a plausible LLM restatement when it found nothing itself)', async () => {
        const model = fakeModel(JSON.stringify({
            objectiveType: 'complete_existing_commitment',
            personHints: [], entityHints: ['dejar excavadora en parcela'],
            timeHint: null, decisionHint: null, draftOnly: false, responsibleHint: null,
            followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: 'Completado desde el planner.',
        }));
        const interpreter = new LlmObjectiveInterpreter({ model });
        const obj = await interpreter.interpret('Completa dejar excavadora en parcela', CTX);
        expect(obj.desiredOutcome).toBe('Completado desde el planner.');
    });
});

// PING — DECLARATIVE LIFECYCLE TRANSITION FIDELITY. Root cause (pre-M-9):
// cancel was not a supported WRITE capability (toolRegistry.service.ts had
// exactly 5 WRITE tools, none for cancel; AgentObjectiveType had no
// cancel_existing_commitment variant) -- the LLM prompt lists 8 fixed
// choices with no "cancel" option, so a cancellation utterance got mapped
// to the semantically nearest one (physically observed:
// complete_existing_commitment), and the planner then produced a
// user-facing message describing an inability to "completar" for a
// request that was never about completing anything.
//
// M-9: cancel_existing_commitment is now a real capability, but ONLY for
// the genuine imperative form ("Cancela X") -- the historical plural
// ("Cancelamos X", a statement/question about something already decided,
// never a write request) must still be forced to 'unsupported' exactly as
// before, or the original substitution bug resurfaces for that one form.
// Core deterministically decides which form applies from the raw text,
// regardless of what the LLM (or the deterministic fallback's OTHER verb
// checks) proposed -- the SAME "LLM suggests, Core decides" precedence
// already established for target-hint normalization, now applied to
// objectiveType itself.
describe('PING — DECLARATIVE LIFECYCLE TRANSITION FIDELITY: cancel is a real capability for the imperative form, still never silently substituted by another lifecycle transition for the historical form', () => {
    describe('DeterministicObjectiveInterpreter', () => {
        const interpreter = new DeterministicObjectiveInterpreter();

        it('M-9: "Cancela la tarea X" (genuine imperative) -> cancel_existing_commitment, a real capability now', async () => {
            const obj = await interpreter.interpret('Cancela la tarea X', CTX);
            expect(obj.objectiveType).toBe('cancel_existing_commitment');
            // extractEntityHint strips the generic "la tarea" noun phrase,
            // same as it already does for every other verb branch in this
            // file -- 'X' alone is the correct, consistent extraction.
            expect(obj.targetEntities.entityHints).toEqual(['X']);
        });

        it('M-9: "Cancelar X" and "Cancel X" (other imperative surface forms) also route to cancel_existing_commitment', async () => {
            const es = await interpreter.interpret('Cancelar X', CTX);
            const en = await interpreter.interpret('Cancel X', CTX);
            expect(es.objectiveType).toBe('cancel_existing_commitment');
            expect(en.objectiveType).toBe('cancel_existing_commitment');
        });

        it('REAL PHYSICAL FIXTURE, historical form still protected: "Cancelamos el compromiso ir a acostarse" -> unsupported, never complete_existing_commitment', async () => {
            const obj = await interpreter.interpret('Cancelamos el compromiso ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('unsupported');
            expect(obj.objectiveType).not.toBe('complete_existing_commitment');
            expect(obj.objectiveType).not.toBe('cancel_existing_commitment');
        });

        it('historical form: "Cancelamos la propuesta ir a acostarse" -> unsupported, never respond_to_existing_proposal/reject (cancel and reject are distinct actions -- this fix never conflates them)', async () => {
            const obj = await interpreter.interpret('Cancelamos la propuesta ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('unsupported');
        });

        it('historical form is checked before accept/reject/reschedule/complete -- a sentence that happens to also contain another domain word never escapes the unsupported routing', async () => {
            const obj = await interpreter.interpret('Cancelamos el compromiso de completar el reporte', CTX);
            expect(obj.objectiveType).toBe('unsupported');
        });

        it('imperative form is ALSO checked before accept/reject/reschedule/complete -- never coincidentally escapes to a different capability', async () => {
            const obj = await interpreter.interpret('Cancela el compromiso de completar el reporte', CTX);
            expect(obj.objectiveType).toBe('cancel_existing_commitment');
        });
    });

    describe('LlmObjectiveInterpreter -- Core overrides the LLM\'s guessed objectiveType whenever the raw text contains a cancel verb, for BOTH forms', () => {
        it('M-9: imperative form -- LLM guesses complete_existing_commitment, Core still forces the REAL cancel capability (imperative text always wins over any LLM guess)', async () => {
            const model = fakeModel(JSON.stringify({
                objectiveType: 'complete_existing_commitment',
                personHints: [], entityHints: ['ir a acostarse'], timeHint: null,
                decisionHint: null, draftOnly: false, responsibleHint: null,
                followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            }));
            const interpreter = new LlmObjectiveInterpreter({ model });
            const obj = await interpreter.interpret('Cancela el compromiso ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('cancel_existing_commitment');
            expect(obj.objectiveType).not.toBe('complete_existing_commitment');
        });

        it('REAL PHYSICAL FIXTURE, historical form: LLM returns the exact wrong objectiveType observed in staging (complete_existing_commitment) for a cancel utterance -- Core still forces unsupported, never the real write capability either', async () => {
            const model = fakeModel(JSON.stringify({
                objectiveType: 'complete_existing_commitment',
                personHints: [], entityHints: ['ir a acostarse'], timeHint: null,
                decisionHint: null, draftOnly: false, responsibleHint: null,
                followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            }));
            const interpreter = new LlmObjectiveInterpreter({ model });
            const obj = await interpreter.interpret('Cancelamos el compromiso ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('unsupported');
            expect(obj.objectiveType).not.toBe('complete_existing_commitment');
            expect(obj.objectiveType).not.toBe('cancel_existing_commitment');
        });

        it('historical form: LLM guesses reschedule_existing_commitment for a cancel utterance -- Core still forces unsupported (any wrong guess is corrected, not just the one physically observed)', async () => {
            const model = fakeModel(JSON.stringify({
                objectiveType: 'reschedule_existing_commitment',
                personHints: [], entityHints: ['ir a acostarse'], timeHint: null,
                decisionHint: null, draftOnly: false, responsibleHint: null,
                followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            }));
            const interpreter = new LlmObjectiveInterpreter({ model });
            const obj = await interpreter.interpret('Cancelamos el compromiso ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('unsupported');
        });

        it('historical form: LLM guesses respond_to_existing_proposal/reject for a cancel utterance -- Core still forces unsupported (cancel is never silently treated as reject even though both are "closing" actions)', async () => {
            const model = fakeModel(JSON.stringify({
                objectiveType: 'respond_to_existing_proposal',
                personHints: [], entityHints: ['ir a acostarse'], timeHint: null,
                decisionHint: 'reject', draftOnly: false, responsibleHint: null,
                followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            }));
            const interpreter = new LlmObjectiveInterpreter({ model });
            const obj = await interpreter.interpret('Cancelamos el compromiso ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('unsupported');
        });

        it('historical form: LLM correctly guesses unsupported already -- Core override is a no-op, never corrupts an already-correct classification', async () => {
            const model = fakeModel(JSON.stringify({
                objectiveType: 'unsupported',
                personHints: [], entityHints: [], timeHint: null,
                decisionHint: null, draftOnly: false, responsibleHint: null,
                followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            }));
            const interpreter = new LlmObjectiveInterpreter({ model });
            const obj = await interpreter.interpret('Cancelamos el compromiso ir a acostarse', CTX);
            expect(obj.objectiveType).toBe('unsupported');
        });

        it('a non-cancel utterance is never affected by this override -- "Completa dejar excavadora en parcela" still correctly maps to complete_existing_commitment', async () => {
            const model = fakeModel(JSON.stringify({
                objectiveType: 'complete_existing_commitment',
                personHints: [], entityHints: ['dejar excavadora en parcela'], timeHint: null,
                decisionHint: null, draftOnly: false, responsibleHint: null,
                followUpObjectiveType: null, additionalPersonHint: null, desiredOutcomeHint: null,
            }));
            const interpreter = new LlmObjectiveInterpreter({ model });
            const obj = await interpreter.interpret('Completa dejar excavadora en parcela', CTX);
            expect(obj.objectiveType).toBe('complete_existing_commitment');
        });
    });

    // 8-TRANSITION AUDIT MATRIX from the ticket: requested transition in
    // MUST equal the objectiveType (and therefore the transition
    // referenced downstream in planner/synthesizer prose) unless Core
    // explicitly and intentionally maps to a different canonical action.
    // All phrases in this matrix use the HISTORICAL "-amos" plural form
    // (a statement/question about something already decided) -- the
    // matrix's own point is that requested transition == objectiveType for
    // this form specifically, never that the underlying capability is
    // absent (M-9 added cancel_existing_commitment as a real capability for
    // the SEPARATE imperative form, covered in its own dedicated describe
    // block above; the historical form entries #1/#6 below continue to map
    // to 'unsupported', exactly as before M-9, since a historical statement
    // must never itself become a write action). reabrir (#4) remains a
    // genuine capability gap for both forms -- no reopen tool exists yet.
    describe('8-transition audit matrix (historical "-amos" form): requested transition == objectiveType, unless intentionally mapped (cancel/reopen -> unsupported, documented)', () => {
        const interpreter = new DeterministicObjectiveInterpreter();
        const MATRIX: Array<[string, string, string]> = [
            ['1', 'Cancelamos el compromiso X', 'unsupported'],
            ['2', 'Completamos el compromiso X', 'complete_existing_commitment'],
            ['3', 'Reprogramamos el compromiso X para mañana a las 10', 'reschedule_existing_commitment'],
            ['4', 'Reabrimos el compromiso X', 'unsupported'], // reabrir (reopen) is also not a WRITE tool -- same class of gap, verified honestly here rather than silently substituted
            ['5', 'Rechazamos la propuesta X', 'respond_to_existing_proposal'],
            ['6', 'Cancelamos la propuesta X', 'unsupported'],
            ['7', 'Completamos la propuesta X', 'complete_existing_commitment'],
            ['8', 'Reprogramamos la propuesta X para mañana a las 10', 'reschedule_existing_commitment'],
        ];
        for (const [n, phrase, expected] of MATRIX) {
            it(`#${n} "${phrase}" -> objectiveType === '${expected}'`, async () => {
                const obj = await interpreter.interpret(phrase, CTX);
                expect(obj.objectiveType).toBe(expected);
            });
        }

        it('#5 reject decisionHint is set correctly (rechazar is a real, distinct, supported action -- never conflated with cancel)', async () => {
            const obj = await interpreter.interpret('Rechazamos la propuesta X', CTX);
            expect(obj.constraints.decisionHint).toBe('reject');
        });
    });

    it('does not regress reject-proposal (a genuinely supported action distinct from cancel): "Rechaza la propuesta ir a acostarse" -> respond_to_existing_proposal, decisionHint reject', async () => {
        const interpreter = new DeterministicObjectiveInterpreter();
        const obj = await interpreter.interpret('Rechaza la propuesta ir a acostarse', CTX);
        expect(obj.objectiveType).toBe('respond_to_existing_proposal');
        expect(obj.constraints.decisionHint).toBe('reject');
    });
});
