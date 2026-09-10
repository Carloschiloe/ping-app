import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RetrievalPerson } from '../src/types/retrieval';

const ACTOR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const RECIPIENT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const recipient: RetrievalPerson = {
    kind: 'user',
    id: RECIPIENT_ID,
    displayName: 'Alejandra',
};

const { resolvePersonMock, resolveDirectConversationMock } = vi.hoisted(() => ({
    resolvePersonMock: vi.fn(),
    resolveDirectConversationMock: vi.fn(),
}));

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: (...args: unknown[]) => resolvePersonMock(...args),
    resolveDirectConversation: (...args: unknown[]) => resolveDirectConversationMock(...args),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
}));

import { DeterministicObjectiveInterpreter, type AgentObjectiveModel } from '../src/services/agentObjectiveInterpreter.service';
import { runAgentPlanning } from '../src/services/agentPlanOrchestrator.service';

const objectiveInterpreter = new DeterministicObjectiveInterpreter();

// M-6 semantic enrichment bridge: "Dile a Alejandra que llegaré tarde." has
// no colon/quote, so the deterministic proposer alone yields no
// communicateContentCandidate (sección: "no que/si/that table") -- the real
// bridge (agentPlanOrchestrator.service.ts) needs a live semantic provider
// to fill that gap. This fake stands in for one, returning the exact
// verbatim substring that already exists in the fixture utterance -- Core
// (validateCommunicateContent) still independently locates/validates it,
// exactly as it would a real provider's response.
function fakeSemanticModel(verbatimMessageHint: string | null): AgentObjectiveModel {
    return {
        modelName: 'test-fake-semantic-model',
        async interpret() {
            return JSON.stringify({ objectiveType: 'communicate_message', verbatimMessageHint });
        },
    };
}

beforeEach(() => {
    resolvePersonMock.mockReset();
    resolveDirectConversationMock.mockReset();
});

describe('runAgentPlanning: global recipient/conversation resolution', () => {
    it('finaliza ready_for_authorization con ids canónicos y el contenido exacto', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({
            conversationId: CONVERSATION_ID,
            ambiguous: false,
            candidateCount: 1,
        });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            now: new Date('2026-09-09T12:00:00.000Z'),
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.canExecute).toBe(true);
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({
            toolId: 'send_message',
            arguments: {
                conversationId: CONVERSATION_ID,
                recipientPersonId: RECIPIENT_ID,
                content: 'llegaré tarde.',
            },
        });
        expect(plan.planDigest).toBeTruthy();
    });

    it('mantiene needs_clarification cuando coinciden varias personas', async () => {
        resolvePersonMock.mockResolvedValue({
            resolved: null,
            ambiguous: true,
            candidates: [recipient, { ...recipient, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' }],
        });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.canExecute).toBe(false);
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('recipient');
        expect(resolveDirectConversationMock).not.toHaveBeenCalled();
    });

    it('no produce un plan listo cuando la persona no tiene conversación directa autorizada', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({
            conversationId: null,
            ambiguous: false,
            candidateCount: 0,
        });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.canExecute).toBe(false);
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('conversation');
    });

    it('con currentConversationId conserva el flujo contextual y no ejecuta resolución global', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });

        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ conversationId: CONVERSATION_ID });
        expect(resolveDirectConversationMock).not.toHaveBeenCalled();
    });
});

describe('runAgentPlanning: M-6 semantic enrichment BRIDGE (deterministic first; semantic enrichment is a HINT stage, never a second source of truth)', () => {
    beforeEach(() => {
        resolvePersonMock.mockReset();
        resolveDirectConversationMock.mockReset();
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
    });

    it('1) deterministic colon/quote path never calls semantic enrichment (no network when a safe candidate already exists)', async () => {
        const enrichModel = vi.fn(async () => JSON.stringify({ objectiveType: 'communicate_message', verbatimMessageHint: 'jamás debería usarse esto' }));
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra: llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: { modelName: 'spy', interpret: enrichModel } });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde.' });
        expect(enrichModel).not.toHaveBeenCalled();
    });

    it('2) natural Spanish path ("Dile a Alejandra que llegaré tarde.") uses semantic enrichment and reaches ready_for_authorization', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde.' });
    });

    it('3) natural English path ("Tell Alejandra that I\'ll be late") uses the same architecture, no English-specific connector rule', async () => {
        // The deterministic person-hint regex only recognizes Spanish "a"/
        // "para" prepositions, so this constructs the objective the same way
        // the real deterministic interpreter would have to for an English
        // sentence with no recognizable preposition -- resolvedObjective lets
        // us exercise the BRIDGE + Core validation in isolation, which is
        // exactly what's being certified here (never a second parser).
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {},
            desiredOutcome: "Tell Alejandra that I'll be late",
            timeConstraints: { rawHint: null },
            actor: ACTOR_ID,
            sourceUtterance: "Tell Alejandra that I'll be late",
            confidence: 0.75,
            ambiguities: [],
            source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: "Tell Alejandra that I'll be late",
            conversationId: CONVERSATION_ID,
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel("I'll be late") });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: "I'll be late" });
    });

    it('4) translated/paraphrased semantic hint is rejected by Core -- never becomes executable content', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Inform Alejandra that I will arrive late') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('5) semantic provider failure (timeout/error/not configured) -> clarification, zero writes, never fabricates a payload', async () => {
        const failingModel: AgentObjectiveModel = {
            modelName: 'failing',
            async interpret() { throw new Error('network down'); },
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
            conversationId: CONVERSATION_ID,
        }, { objectiveInterpreter, semanticContentModel: failingModel });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.canExecute).toBe(false);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('6) existing global recipient resolution remains intact when enrichment supplies the candidate', async () => {
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('llegaré tarde.') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({
            recipientPersonId: RECIPIENT_ID,
            conversationId: CONVERSATION_ID,
            content: 'llegaré tarde.',
        });
    });

    it('bridge never alters actor/recipient/conversation/tool: enrichment supplies content ONLY, everything else stays exactly what deterministic/global resolution produced', async () => {
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const enrichModel = vi.fn(async () => JSON.stringify({
            objectiveType: 'create_commitment_or_proposal', // a hostile/buggy provider trying to change the tool/intent
            personHints: ['SomeoneElse'], // and the recipient
            verbatimMessageHint: 'llegaré tarde.',
        }));
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde.',
        }, { objectiveInterpreter, semanticContentModel: { modelName: 'hostile', interpret: enrichModel } });

        // The bridge only ever reads verbatimMessageHint off the response --
        // objectiveType/personHints returned by the "model" are structurally
        // never read by proposeSemanticContentCandidate, so the plan is
        // still exactly the deterministic communicate_message/send_message
        // to the real, already-resolved Alejandra.
        expect(plan.objective.objectiveType).toBe('communicate_message');
        expect(plan.steps[0]?.toolId).toBe('send_message');
        expect(plan.steps[0]?.arguments).toMatchObject({ recipientPersonId: RECIPIENT_ID, conversationId: CONVERSATION_ID });
    });
});

describe('REGRESSION -- real M-6 staging failure (2026-09-10 physical iPhone retest): gpt-4o-mini capitalizes the first letter of a "verbatim" candidate even when explicitly told not to', () => {
    beforeEach(() => {
        resolvePersonMock.mockReset();
        resolveDirectConversationMock.mockReset();
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
    });

    it('exact reported failure: input has no trailing period, real provider returns "Llegaré tarde" (capital L) -- Core must still locate/freeze it, from the ORIGINAL lowercase source, never the candidate\'s own casing', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Llegaré tarde') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps).toHaveLength(1);
        expect(plan.steps[0]).toMatchObject({
            toolId: 'send_message',
            arguments: {
                recipientPersonId: RECIPIENT_ID,
                conversationId: CONVERSATION_ID,
                // Frozen content is the REAL source substring -- lowercase
                // "ll", exactly as the user typed mid-sentence -- never the
                // candidate's capitalized casing. This is the concrete
                // assertion that the fix normalizes only the SEARCH, never
                // what gets sent.
                content: 'llegaré tarde',
            },
        });
    });

    it('same case-mismatch class in English: provider capitalizes "I\'ll be late" style openers too', async () => {
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {},
            desiredOutcome: "tell Alejandra i'll be late",
            timeConstraints: { rawHint: null },
            actor: ACTOR_ID,
            sourceUtterance: "tell Alejandra i'll be late",
            confidence: 0.75,
            ambiguities: [],
            source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: "tell Alejandra i'll be late",
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel("I'll be late") });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: "i'll be late" });
    });

    it('case-insensitive matching still rejects a genuinely ambiguous candidate (2+ case-insensitive occurrences) -- normalization never weakens the uniqueness invariant', async () => {
        // No colon/quote -- the deterministic fast path finds nothing, so
        // this genuinely exercises the semantic-enrichment bridge (a colon
        // form would let the deterministic proposer claim the whole
        // trailing clause as its own candidate before the bridge ever runs).
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que tarde es mejor que muy tarde',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Tarde') });

        // "tarde" appears twice (case-insensitively) after "Alejandra" --
        // still rejected as ambiguous, exactly like the exact-case path.
        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('case-insensitive matching still rejects a translated/paraphrased candidate -- it is not a real substring at any casing', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Inform Alejandra That I Will Arrive Late') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });
});

describe('REGRESSION -- Unicode-safe verbatim localization: every slice() boundary is derived from the ORIGINAL sourceUtterance, never from a lowercased/normalized copy', () => {
    beforeEach(() => {
        resolvePersonMock.mockReset();
        resolveDirectConversationMock.mockReset();
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
    });

    it('reported Spanish case: lowercase source, capitalized candidate -- exact match fails, case-insensitive fallback locates it, frozen content is the ORIGINAL lowercase text', async () => {
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde',
        }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Llegaré tarde') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde' });
    });

    it('English casing: source has a lowercase sentence-initial word, candidate capitalizes it -- same fallback, same original-case freeze', async () => {
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'tell Alejandra running late today',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'tell Alejandra running late today',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'tell Alejandra running late today',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('Running Late Today') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'running late today' });
    });

    it('Unicode length-changing case mapping (İ-class, U+0130): exact match on the SAME grapheme succeeds via the exact-first pass, proving no corrupted/misaligned boundary — the length-changing fold is never exercised on a real match', async () => {
        // "İ" (U+0130 LATIN CAPITAL LETTER I WITH DOT ABOVE) lowercases to
        // "i" + COMBINING DOT ABOVE (2 code units) -- a lowercase-then-index
        // approach would misalign here. Using the exact grapheme in both
        // source and candidate exercises this exact character class while
        // taking the exact-match pass (requirement: exact always preferred)
        // -- boundaries come straight from indexOf, no case-folding involved.
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'Dile a Alejandra que İstanbul nos espera',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que İstanbul nos espera',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('İstanbul nos espera') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'İstanbul nos espera' });
    });

    it('Unicode length-changing case mapping (İ-class): a CASE-DIVERGENT İ/i pair never matches and never crashes or misaligns -- fails safely to clarification rather than producing a wrong span', async () => {
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'Dile a Alejandra que İstanbul nos espera',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        // Candidate uses plain "i" where source has "İ" -- these are
        // different graphemes/case-fold classes, so they must not match at
        // all (never a corrupted match at the wrong offset).
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que İstanbul nos espera',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('istanbul nos espera') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('emoji (surrogate-pair / astral code points): exact preservation, boundary never splits a surrogate pair', async () => {
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'Dile a Alejandra que 🎉 llegamos tarde 🎉 nos vemos pronto',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        // Candidate capitalizes "Llegamos" the same way the model does for
        // natural phrasing -- exercises BOTH the case-insensitive fallback
        // AND emoji/surrogate-pair handling in the same pass.
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que 🎉 llegamos tarde 🎉 nos vemos pronto',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('🎉 Llegamos tarde 🎉 nos vemos pronto') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: '🎉 llegamos tarde 🎉 nos vemos pronto' });
    });

    it('combining Unicode text (base + combining diacritic, NFD form): located and frozen intact, never split mid-grapheme', async () => {
        // "é" written as "e" + COMBINING ACUTE ACCENT (U+0065 U+0301, NFD)
        // rather than the single precomposed U+00E9 (NFC) -- a real, valid
        // way for text to arrive. The grapheme segmenter keeps the base
        // character and its combining mark together as one grapheme, so a
        // capitalized candidate still locates the whole cluster correctly.
        const combiningSource = 'Dile a Alejandra que llegaré tarde';
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: combiningSource,
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: combiningSource,
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('Llegaré tarde') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde' });
    });

    it('two case-insensitive matches in the valid region -> ambiguous, never guesses which one is real', async () => {
        // Candidate casing ("TARDE") matches NEITHER occurrence exactly, so
        // the exact pass finds zero matches and the case-insensitive
        // fallback runs -- where it correctly finds both "Tarde" and
        // "tarde" and rejects as ambiguous rather than guessing.
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'Dile a Alejandra que Tarde es mejor que muy tarde',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que Tarde es mejor que muy tarde',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('TARDE') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('translated/paraphrased candidate is rejected even under the Unicode-aware fallback -- it is not a real grapheme-for-grapheme match at any casing', async () => {
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'Dile a Alejandra que llegaré tarde',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra que llegaré tarde',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('INFORM ALEJANDRA THAT I WILL ARRIVE LATE') });

        expect(plan.status).toBe('needs_clarification');
        expect(plan.steps).toEqual([]);
        expect(plan.unresolvedInputs[0]?.field).toBe('messageContent');
    });

    it('exact match is preferred and SHORT-CIRCUITS the case-insensitive fallback: a single exact occurrence resolves cleanly even when a different-case occurrence also exists elsewhere', async () => {
        // "llegaré tarde" (lowercase) occurs exactly ONCE; "Llegaré tarde"
        // (capitalized) occurs once more, later in the same sentence. If
        // exact-match-first did not short-circuit -- i.e. if both passes'
        // results were merged -- the case-insensitive fallback would also
        // match the capitalized occurrence, making this "2 occurrences" ->
        // ambiguous. Because pass 1 (exact) finds its own unique match and
        // returns immediately without ever running pass 2, this instead
        // resolves cleanly to ready_for_authorization with the FIRST
        // (exact-case) occurrence as content.
        const objective = {
            objectiveType: 'communicate_message' as const,
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            constraints: {}, desiredOutcome: 'source',
            timeConstraints: { rawHint: null }, actor: ACTOR_ID,
            sourceUtterance: 'Dile a Alejandra: llegaré tarde y Llegaré tarde otra vez',
            confidence: 0.75, ambiguities: [], source: 'deterministic' as const,
        };
        const plan = await runAgentPlanning({
            actorUserId: ACTOR_ID,
            input: 'Dile a Alejandra: llegaré tarde y Llegaré tarde otra vez',
        }, { resolvedObjective: objective, semanticContentModel: fakeSemanticModel('llegaré tarde') });

        expect(plan.status).toBe('ready_for_authorization');
        expect(plan.steps[0]?.arguments).toMatchObject({ content: 'llegaré tarde' });
    });
});

describe('OBSERVABILITY -- structured, non-sensitive trace fields for the enrichment/validation boundary (sección 40: ids/counts/booleans/enum labels only, never message content)', () => {
    beforeEach(() => {
        resolvePersonMock.mockReset();
        resolveDirectConversationMock.mockReset();
        resolvePersonMock.mockResolvedValue({ resolved: recipient, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
    });

    it('successful enrichment traces provider_available/candidate_returned=true and a successful validation, with no rejection_reason', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            await runAgentPlanning({
                actorUserId: ACTOR_ID,
                input: 'Dile a Alejandra que llegaré tarde',
                traceId: 'trace-obs-1',
            }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Llegaré tarde') });

            const lines = logSpy.mock.calls.map((call) => call.join(' '));
            const enrichmentLine = lines.find((l) => l.includes('[SEMANTIC_ENRICHMENT]'));
            const validationLine = lines.find((l) => l.includes('[COMMUNICATE_CONTENT_VALIDATED]'));
            expect(enrichmentLine).toBeDefined();
            expect(enrichmentLine).toContain('"provider_available":true');
            expect(enrichmentLine).toContain('"candidate_returned":true');
            expect(enrichmentLine).not.toContain('llegaré'); // never logs the message text itself
            expect(validationLine).toBeDefined();
            expect(validationLine).toContain('"candidate_validated":true');
            expect(validationLine).toContain('"rejection_reason":null');
        } finally {
            logSpy.mockRestore();
        }
    });

    it('provider-not-configured traces provider_available=false with rejection_reason "not_configured", and Core validation traces "no_candidate"', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        const originalKey = process.env.OPENAI_API_KEY;
        process.env.OPENAI_API_KEY = '';
        try {
            await runAgentPlanning({
                actorUserId: ACTOR_ID,
                input: 'Dile a Alejandra que llegaré tarde',
                traceId: 'trace-obs-2',
            }, { objectiveInterpreter }); // no semanticContentModel injected -- real (unconfigured) provider path

            const lines = logSpy.mock.calls.map((call) => call.join(' '));
            const enrichmentLine = lines.find((l) => l.includes('[SEMANTIC_ENRICHMENT]'));
            const validationLine = lines.find((l) => l.includes('[COMMUNICATE_CONTENT_VALIDATED]'));
            expect(enrichmentLine).toContain('"provider_available":false');
            expect(enrichmentLine).toContain('"rejection_reason":"not_configured"');
            expect(validationLine).toContain('"candidate_validated":false');
            expect(validationLine).toContain('"rejection_reason":"no_candidate"');
        } finally {
            if (originalKey === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = originalKey;
            logSpy.mockRestore();
        }
    });

    it('a translated candidate traces candidate_returned=true (provider DID respond) but candidate_validated=false with rejection_reason "not_found" -- distinguishes "provider silent" from "provider wrong"', async () => {
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
        try {
            await runAgentPlanning({
                actorUserId: ACTOR_ID,
                input: 'Dile a Alejandra que llegaré tarde',
                traceId: 'trace-obs-3',
            }, { objectiveInterpreter, semanticContentModel: fakeSemanticModel('Inform Alejandra that I will arrive late') });

            const lines = logSpy.mock.calls.map((call) => call.join(' '));
            const enrichmentLine = lines.find((l) => l.includes('[SEMANTIC_ENRICHMENT]'));
            const validationLine = lines.find((l) => l.includes('[COMMUNICATE_CONTENT_VALIDATED]'));
            expect(enrichmentLine).toContain('"candidate_returned":true');
            expect(validationLine).toContain('"candidate_validated":false');
            expect(validationLine).toContain('"rejection_reason":"not_found"');
        } finally {
            logSpy.mockRestore();
        }
    });
});
