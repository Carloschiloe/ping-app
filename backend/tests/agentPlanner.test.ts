import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RetrievalCommitment, RetrievalPerson } from '../src/types/retrieval';
import type { AgentObjective, MessageContentCandidate } from '../src/types/agentPlan';
import { proposeCommunicateContent } from '../src/services/agentObjectiveInterpreter.service';

const CARLOS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ALEJANDRA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ENTRENAR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const alejandraPerson: RetrievalPerson = { kind: 'user', id: ALEJANDRA_ID, displayName: 'Alejandra' };

// Use vi.hoisted to make mocks available during hoisting
const { resolvePersonMock, retrieveCommitmentsMock, retrieveCommitmentProposalsMock,
    parseDateFromTextMock, retrieveMemoryMock, resolveDirectConversationMock } = vi.hoisted(() => ({
    resolvePersonMock: vi.fn(),
    retrieveCommitmentsMock: vi.fn(async () => []),
    retrieveCommitmentProposalsMock: vi.fn(async () => []),
    parseDateFromTextMock: vi.fn(() => null),
    retrieveMemoryMock: vi.fn(async () => []),
    resolveDirectConversationMock: vi.fn(),
}));

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: (...args: any[]) => resolvePersonMock(...args),
    retrieveCommitments: (...args: any[]) => retrieveCommitmentsMock(...args),
    retrieveCommitmentProposals: (...args: any[]) => retrieveCommitmentProposalsMock(...args),
    resolveDirectConversation: (...args: any[]) => resolveDirectConversationMock(...args),
}));
vi.mock('../src/services/date-parser.service', () => ({
    parseDateFromText: (...args: any[]) => parseDateFromTextMock(...args),
    resolveTimeZone: (tz?: string | null) => tz || 'America/Santiago',
}));
// Nunca debe tocar la red/Postgres real -- mismo motivo que
// retrieval.service.ts/date-parser.service.ts arriba (sección 49: "fake
// provider en tests, no network"). Por defecto no encuentra nada, así que
// los tests que ya asumían "sin fecha -> ambigüedad bloqueante" siguen
// pasando sin depender de memoria (memory-informed planning se prueba por
// separado, explícitamente, abajo).
vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: (...args: any[]) => retrieveMemoryMock(...args),
}));

function baseObjective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'communicate_message',
        targetEntities: { personHints: [], entityHints: [] },
        constraints: {},
        desiredOutcome: 'test',
        timeConstraints: { rawHint: null },
        actor: CARLOS,
        sourceUtterance: 'test utterance',
        confidence: 0.8,
        ambiguities: [],
        source: 'deterministic',
        ...overrides,
    };
}

// Simula lo que la interpretación determinística real (colon/quote) haría
// antes de llegar al planner -- la misma función que usa el interpreter en
// producción, nunca una reimplementación local.
function communicateCandidate(sourceUtterance: string, personHint: string): MessageContentCandidate | null {
    return proposeCommunicateContent(sourceUtterance, personHint);
}

// Para frases naturales sin colon/comillas ("Dile a Alejandra que...",
// "Tell Alejandra that...") NO existe un fast path determinístico (sección
// arquitectónica: cero tablas de conectores en el canonical path) -- sólo
// un intérprete semántico real (LLM) podría proponer un candidato ahí. Este
// helper simula EXACTAMENTE esa propuesta (texto verbatim, nunca un
// offset), tal como llegaría en `objective.communicateContentCandidate` si
// el LLM la hubiese producido -- el propio validateCommunicateContent de
// Core es quien prueba, de forma independiente, que ese texto realmente
// ocurre en el sourceUtterance.
function semanticVerbatimCandidate(verbatimText: string): MessageContentCandidate {
    return { verbatimText, extractionMode: 'semantic_verbatim' };
}

function commitmentFixture(overrides: Partial<RetrievalCommitment> = {}): RetrievalCommitment {
    return {
        id: ENTRENAR_ID, entityType: 'commitment', title: 'Entrenar', description: null,
        status: 'accepted', type: 'task', priority: null, dueAt: null, proposedDueAt: null,
        expectedResult: null, resolvedAt: null, resolutionResult: null, rejectionReason: null,
        ownerUserId: CARLOS, assignedToUserId: CARLOS, counterpartyContactId: null,
        conversationId: null, messageId: null, createdAt: '2026-09-01T00:00:00.000Z',
        provenance: { sourceType: 'commitment', sourceId: ENTRENAR_ID },
        ...overrides,
    };
}

beforeEach(() => {
    resolvePersonMock.mockReset();
    retrieveCommitmentsMock.mockReset().mockResolvedValue([]);
    retrieveCommitmentProposalsMock.mockReset().mockResolvedValue([]);
    parseDateFromTextMock.mockReset().mockReturnValue(null);
    retrieveMemoryMock.mockReset().mockResolvedValue([]);
    resolveDirectConversationMock.mockReset();
});

import { planObjective } from '../src/services/agentPlanner.service';

describe('planCommunicate (sección 12: identity resolution, nunca inventa un destinatario)', () => {

    it('persona resuelta -> un step send_message, content validado por Core a partir del candidato verbatim propuesto (nunca de desiredOutcome)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Llegaré tarde',
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('send_message');
        expect(result.steps[0].arguments).toMatchObject({ recipientPersonId: ALEJANDRA_ID, content: 'llegaré tarde' });
        expect(resolveDirectConversationMock).not.toHaveBeenCalled();
    });

    it('persona ambigua -> ambigüedad bloqueante con candidatos reales, nunca un plan silencioso', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: null, ambiguous: true, candidates: [alejandraPerson, { ...alejandraPerson, id: 'other-id', displayName: 'Alejandra Otra' }] });
        const objective = baseObjective({ targetEntities: { personHints: ['Alejandra'], entityHints: [] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].kind).toBe('blocking');
        expect(result.blockingAmbiguities[0].candidates).toHaveLength(2);
    });

    it('persona no encontrada -> ambigüedad bloqueante, nunca inventa un id', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: null, ambiguous: false, candidates: [] });
        const objective = baseObjective({ targetEntities: { personHints: ['Fulano'], entityHints: [] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].field).toBe('recipient');
    });

    it('sin conversationId pero con persona y conversación directas resueltas -> draft normal sin bloqueo (recipiente global sigue funcionando)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Llegaré tarde',
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBeUndefined();
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('send_message');
        expect(result.steps[0].arguments).toMatchObject({ recipientPersonId: ALEJANDRA_ID, conversationId: CONVERSATION_ID, content: 'llegaré tarde' });
        expect(result.steps[0].provenance.canonicalSourceRefs).toContainEqual({ sourceType: 'conversation', sourceId: CONVERSATION_ID });
    });

    it('sin conversationId, persona resuelta pero conversación ambigua -> ambigüedad bloqueante', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: null, ambiguous: true, candidateCount: 2 });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Llegaré tarde',
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities).toHaveLength(1);
        expect(result.blockingAmbiguities[0].field).toBe('conversation');
        expect(result.blockingAmbiguities[0].reason).toContain('2 conversaciones directas');
    });

    it('sin conversationId, persona resuelta pero sin conversación directa -> ambigüedad bloqueante', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: null, ambiguous: false, candidateCount: 0 });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Llegaré tarde',
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities).toHaveLength(1);
        expect(result.blockingAmbiguities[0].field).toBe('conversation');
        expect(result.blockingAmbiguities[0].reason).toContain('No existe una conversación directa');
    });

    it('sin ningún personHint -> ambigüedad bloqueante', async () => {
        const objective = baseObjective({ targetEntities: { personHints: [], entityHints: [] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities[0].field).toBe('recipient');
    });

    it('communicate_and_wait con follow-up -> 2 pasos, el segundo depende del primero con condition wait_for_response', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T12:00:00.000Z'), textRef: 'el viernes' });
        const sourceUtterance = 'Pregúntale a Alejandra: puede entrenar el viernes';
        const objective = baseObjective({
            objectiveType: 'communicate_and_wait',
            targetEntities: { personHints: ['Alejandra'], entityHints: ['entrenar'] },
            sourceUtterance,
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        (objective as any).__followUp = 'create_commitment_or_proposal';
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toHaveLength(2);
        expect(result.steps[0].toolId).toBe('send_message');
        expect(result.steps[1].toolId).toBe('create_commitment');
        expect(result.steps[1].dependsOn).toEqual([result.steps[0].stepId]);
        expect(result.steps[1].condition.type).toBe('wait_for_response');
    });
});

describe('planCreateCommitment (sección 14/15/37)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('título + fecha resueltos -> 1 step create_commitment con confirmationRequirement explicit', async () => {
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-08T11:00:00.000Z'), textRef: 'mañana a las 8' });
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('create_commitment');
        expect(result.steps[0].confirmationRequirement).toBe('explicit');
    });

    it('sin fecha -> ambigüedad bloqueante "dueDate ausente" (sección 15, ejemplo explícito de bloqueo)', async () => {
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0].field).toBe('dueAt');
    });

    it('sin título -> ambigüedad bloqueante', async () => {
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: [] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0].field).toBe('title');
    });

    it('create_personal_commitment nunca intenta resolver un responsable', async () => {
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-08T11:00:00.000Z'), textRef: 'mañana' });
        const objective = baseObjective({ objectiveType: 'create_personal_commitment', targetEntities: { personHints: [], entityHints: ['comprar pan'] }, constraints: { responsibleHint: 'Alguien' } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(resolvePersonMock).not.toHaveBeenCalled();
        expect((result.steps[0].arguments as any).responsiblePersonId).toBeNull();
    });

    // PING — CREATE_COMMITMENT TITLE FIDELITY FIX: the planner itself was
    // never the bug (it already trusted objective.targetEntities.
    // entityHints[0] verbatim) -- these tests prove that trust is correct:
    // whatever title the (now-fixed) interpreter puts in entityHints[0]
    // propagates UNCHANGED into create_commitment's args.title, the
    // operation label, and expectedEffect. This is test matrix items
    // 11-14 (planner args preserve title / executor persists exact planned
    // title / authorization preview shows the same title / post-execution
    // verification checks the same title) — executor/authorization/
    // verification all read this same args.title downstream, so proving it
    // here proves the whole chain never diverges.
    it('título explícito con acentos/mayúsculas se propaga VERBATIM a create_commitment.arguments.title -- nunca normalizado, truncado ni reemplazado por un label genérico', async () => {
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T18:30:00.000Z'), textRef: 'hoy a las 18:30' });
        const objective = baseObjective({
            objectiveType: 'create_commitment_or_proposal',
            targetEntities: { personHints: [], entityHints: ['prueba caché Ping'] },
            sourceUtterance: 'Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('create_commitment');
        expect((result.steps[0].arguments as any).title).toBe('prueba caché Ping');
        expect((result.steps[0].arguments as any).title).not.toBe('un compromiso');
        // La operación humana-legible (preview de autorización, item 13 del
        // ticket) también debe citar el título real, nunca uno genérico.
        expect(result.steps[0].operation).toContain('prueba caché Ping');
        expect(result.steps[0].expectedEffect).toContain('prueba caché Ping');
    });

    it('due date + explicit title ambos preservados en el mismo step (item 7 del test matrix)', async () => {
        const dueDate = new Date('2026-09-11T18:30:00.000Z');
        parseDateFromTextMock.mockReturnValue({ date: dueDate, textRef: 'hoy a las 18:30' });
        const objective = baseObjective({
            objectiveType: 'create_commitment_or_proposal',
            targetEntities: { personHints: [], entityHints: ['prueba caché Ping'] },
            sourceUtterance: 'Crea un compromiso para hoy a las 18:30 que se llame prueba caché Ping',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        const args = result.steps[0].arguments as any;
        expect(args.title).toBe('prueba caché Ping');
        expect(args.dueAt).toBe(dueDate.toISOString());
    });
});

describe('planRescheduleOrCompleteOrRespond — entity resolution (sección 13)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('sin entityHint -> ambigüedad bloqueante', async () => {
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: [] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0].field).toBe('targetEntity');
    });

    it('cero candidatos -> failureMode entity_not_found', async () => {
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: ['fantasma'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('entity_not_found');
    });

    it('múltiples candidatos -> ambigüedad bloqueante "cuál Entrenar" con candidatos grounded, nunca un best-guess', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ id: 'c1' }), commitmentFixture({ id: 'c2' })]);
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0].field).toBe('targetEntity');
        expect(result.blockingAmbiguities[0].candidates).toHaveLength(2);
    });

    it('reschedule: no-owner/no-assignee -> failureMode not_authorized, nunca planea una acción no autorizada', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ ownerUserId: 'other-user', assignedToUserId: 'other-user' })]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T12:00:00.000Z'), textRef: 'el viernes' });
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('not_authorized');
    });

    it('reschedule: status inválido para counter_propose -> failureMode invalid_lifecycle', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ status: 'resolved' })]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T12:00:00.000Z'), textRef: 'el viernes' });
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('invalid_lifecycle');
    });

    it('reschedule: owner + status válido + fecha resuelta -> 1 step reschedule_commitment', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ status: 'accepted' })]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T12:00:00.000Z'), textRef: 'el viernes' });
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].toolId).toBe('reschedule_commitment');
    });

    it('reschedule sobre una proposal pendiente con actorCanRespond=true -> respond_to_proposal(counter_propose) (sección 12 del ticket M-3)', async () => {
        retrieveCommitmentProposalsMock.mockResolvedValue([commitmentFixture({ entityType: 'commitment_proposal', status: 'pending', actorCanRespond: true })]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-11T12:00:00.000Z'), textRef: 'el viernes' });
        const objective = baseObjective({ objectiveType: 'reschedule_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].toolId).toBe('respond_to_proposal');
        expect((result.steps[0].arguments as any).decision).toBe('counter_propose');
    });

    it('complete sobre una proposal pendiente -> failureMode invalid_lifecycle (sección 24, ejemplo textual exacto del ticket)', async () => {
        retrieveCommitmentProposalsMock.mockResolvedValue([commitmentFixture({ entityType: 'commitment_proposal', status: 'pending' })]);
        const objective = baseObjective({ objectiveType: 'complete_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('invalid_lifecycle');
    });

    it('complete: owner + status válido -> 1 step complete_commitment', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ status: 'accepted' })]);
        const objective = baseObjective({ objectiveType: 'complete_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].toolId).toBe('complete_commitment');
    });

    it('respond_to_existing_proposal: actorCanRespond=false (ya aprobó, o no le corresponde) -> failureMode not_authorized (sección 24, adversarial D)', async () => {
        retrieveCommitmentProposalsMock.mockResolvedValue([commitmentFixture({ entityType: 'commitment_proposal', actorCanRespond: false, actorHasApproved: true })]);
        const objective = baseObjective({ objectiveType: 'respond_to_existing_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] }, constraints: { decisionHint: 'reject' } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('not_authorized');
    });

    it('respond_to_existing_proposal: actorCanRespond=true -> 1 step respond_to_proposal con la decisión correcta', async () => {
        retrieveCommitmentProposalsMock.mockResolvedValue([commitmentFixture({ entityType: 'commitment_proposal', actorCanRespond: true })]);
        const objective = baseObjective({ objectiveType: 'respond_to_existing_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] }, constraints: { decisionHint: 'approve' } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].toolId).toBe('respond_to_proposal');
        expect((result.steps[0].arguments as any).decision).toBe('approve');
    });

    it('respond_to_existing_proposal sobre un commitment canónico (no una proposal) -> failureMode unsupported_capability, nunca fabrica un tool', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ entityType: 'commitment' })]);
        const objective = baseObjective({ objectiveType: 'respond_to_existing_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('unsupported_capability');
    });

    it('riesgo escalado a "high" cuando el commitment resuelto es compartido (conversationId presente) (sección 36)', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ status: 'accepted', conversationId: CONVERSATION_ID })]);
        const objective = baseObjective({ objectiveType: 'complete_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].riskLevel).toBe('high');
    });

    it('riesgo "medium" cuando el commitment resuelto NO es compartido', async () => {
        retrieveCommitmentsMock.mockResolvedValue([commitmentFixture({ status: 'accepted', conversationId: null })]);
        const objective = baseObjective({ objectiveType: 'complete_existing_commitment', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].riskLevel).toBe('medium');
    });
});

// PING — RESCHEDULE EXISTING COMMITMENT RESOLUTION FIX. These tests
// exercise the REAL resolveEntityHint substring-containment filter inside
// agentPlanner.service.ts (never mocked -- only retrieveCommitments/
// retrieveCommitmentProposals below it are mocked, the same pattern
// already used throughout this file) against a fixture matching the real
// physical staging commitment (id a5f2728f-34e0-4f8f-a11b-c94f1ab148d3,
// title "prueba caché Ping", status "accepted", owner
// d672add7-bb7e-4ce6-b01d-4fbbdb35539b, archived_at null -- confirmed via
// a direct read-only Supabase query before writing any fix). This proves
// the full chain: a clean entityHint (already fixed upstream in
// agentObjectiveInterpreter.service.ts, tested there directly) resolves to
// the EXACT canonical commitment ID, the planner preserves that ID through
// to the tool step, and the authorization preview cites the real title.
const PRUEBA_CACHE_PING_ID = 'a5f2728f-34e0-4f8f-a11b-c94f1ab148d3';
function pruebaCachePingFixture(overrides: Partial<RetrievalCommitment> = {}): RetrievalCommitment {
    return commitmentFixture({
        id: PRUEBA_CACHE_PING_ID, title: 'prueba caché Ping', status: 'accepted',
        ownerUserId: CARLOS, assignedToUserId: CARLOS, conversationId: null,
        dueAt: '2026-09-13T21:30:00.000Z',
        ...overrides,
    });
}

describe('PING — RESCHEDULE EXISTING COMMITMENT RESOLUTION FIX: end-to-end resolution against the real physical staging commitment shape', () => {
    it('REAL PHYSICAL FIXTURE: clean entityHint "prueba caché Ping" resolves uniquely to the canonical commitment ID, plan targets reschedule_commitment, authorization preview cites the real title, new due time preserved', async () => {
        retrieveCommitmentsMock.mockResolvedValue([pruebaCachePingFixture()]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-13T22:30:00.000Z'), textRef: 'hoy a las 19:30' });
        const objective = baseObjective({
            objectiveType: 'reschedule_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['prueba caché Ping'] },
            sourceUtterance: 'Reprograma el compromiso prueba caché Ping para hoy a las 19:30',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });

        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.failureMode).toBeUndefined();
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('reschedule_commitment');
        // ID canónico preservado -- nunca re-resuelto por título después de
        // la autorización, el plan referencia la entidad real por ID.
        expect((result.steps[0].arguments as any).commitmentId ?? (result.steps[0].arguments as any).id).toBe(PRUEBA_CACHE_PING_ID);
        expect((result.steps[0].arguments as any).newDueAt).toBe(new Date('2026-09-13T22:30:00.000Z').toISOString());
        // La autorización/preview cita el TÍTULO real, nunca un genérico.
        expect(result.steps[0].operation).toContain('prueba caché Ping');
        expect(result.steps[0].provenance.canonicalSourceRefs).toContainEqual({ sourceType: 'commitment', sourceId: PRUEBA_CACHE_PING_ID });
    });

    it('a still-polluted entityHint (if one somehow reached the planner) never matches the real title via the honest substring filter -- entity_not_found, never a best-guess against the wrong record', async () => {
        retrieveCommitmentsMock.mockResolvedValue([pruebaCachePingFixture()]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-13T22:30:00.000Z'), textRef: 'hoy a las 19:30' });
        const objective = baseObjective({
            objectiveType: 'reschedule_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['compromiso prueba caché Ping para hoy a las 19:30'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('entity_not_found');
        expect(result.steps).toEqual([]);
    });

    it('a similarly-titled PROPOSAL never becomes the target of a commitment reschedule when a real commitment with the same title also exists -- ambiguity, never a silent wrong-type resolution (structured entityType, never lexical similarity, decides)', async () => {
        retrieveCommitmentsMock.mockResolvedValue([pruebaCachePingFixture()]);
        retrieveCommitmentProposalsMock.mockResolvedValue([
            commitmentFixture({ id: 'proposal-1', entityType: 'commitment_proposal', title: 'prueba caché Ping', status: 'pending' }),
        ]);
        const objective = baseObjective({
            objectiveType: 'reschedule_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['prueba caché Ping'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        // Ambos títulos hacen match por substring -- 2 candidatos reales,
        // nunca colapsados en uno solo por similitud léxica. El commitment
        // real nunca se ejecuta silenciosamente contra la proposal, ni
        // viceversa.
        expect(result.blockingAmbiguities[0]?.field).toBe('targetEntity');
        expect(result.blockingAmbiguities[0]?.candidates).toHaveLength(2);
        expect(result.steps).toEqual([]);
    });

    it('two similarly-named COMMITMENTS -> ambiguity, never mutates an arbitrary one', async () => {
        retrieveCommitmentsMock.mockResolvedValue([
            pruebaCachePingFixture({ id: 'c1' }),
            pruebaCachePingFixture({ id: 'c2', title: 'prueba caché Ping 2' }),
        ]);
        const objective = baseObjective({
            objectiveType: 'reschedule_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['prueba caché Ping'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0]?.field).toBe('targetEntity');
        expect(result.blockingAmbiguities[0]?.candidates).toHaveLength(2);
    });

    it('successful reschedule changes ONLY dueAt -- title/status are never rewritten by the reschedule tool arguments', async () => {
        retrieveCommitmentsMock.mockResolvedValue([pruebaCachePingFixture({ status: 'accepted' })]);
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-13T22:30:00.000Z'), textRef: 'hoy a las 19:30' });
        const objective = baseObjective({
            objectiveType: 'reschedule_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['prueba caché Ping'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        const args = result.steps[0].arguments as any;
        expect(Object.keys(args).some((k) => /title|status/i.test(k))).toBe(false);
    });
});

// PING — COMPLETE_COMMITMENT TARGET / RESOLUTION RESULT EXTRACTION FIX.
// Same end-to-end shape as the reschedule block above, against the real
// physical failure fixture: "Completa el compromiso dejar excavadora en
// parcela indicando como resultado: prueba cierre Ping correcta" wrongly
// produced a polluted entityHint (the whole remainder including the
// result clause), which never matched the real title "dejar excavadora
// en parcela" via the honest substring-containment filter -- exactly the
// physical error message reproduced. Now that
// agentObjectiveInterpreter.service.ts separates target from result
// (tested directly there), this proves the planner receives the clean
// entityHint, resolves the correct canonical commitment ID, and passes
// the extracted result text (never the interpreter's raw sourceUtterance)
// as resolutionResult.
const DEJAR_EXCAVADORA_ID = 'e1f2a3b4-c5d6-47e8-9f01-a2b3c4d5e6f7';
function dejarExcavadoraFixture(overrides: Partial<RetrievalCommitment> = {}): RetrievalCommitment {
    return commitmentFixture({
        id: DEJAR_EXCAVADORA_ID, title: 'dejar excavadora en parcela', status: 'accepted',
        ownerUserId: CARLOS, assignedToUserId: CARLOS, conversationId: null,
        ...overrides,
    });
}

describe('PING — COMPLETE_COMMITMENT TARGET / RESOLUTION RESULT EXTRACTION FIX: end-to-end resolution against the real physical failure fixture', () => {
    it('REAL PHYSICAL FIXTURE: clean entityHint "dejar excavadora en parcela" (already separated upstream) resolves uniquely to the canonical commitment ID, plan targets complete_commitment with the exact extracted resolutionResult, never the raw polluted sourceUtterance', async () => {
        retrieveCommitmentsMock.mockResolvedValue([dejarExcavadoraFixture()]);
        const objective = baseObjective({
            objectiveType: 'complete_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['dejar excavadora en parcela'] },
            desiredOutcome: 'prueba cierre Ping correcta',
            sourceUtterance: 'Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });

        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.failureMode).toBeUndefined();
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('complete_commitment');
        const args = result.steps[0].arguments as any;
        expect(args.commitmentId).toBe(DEJAR_EXCAVADORA_ID);
        expect(args.resolutionResult).toBe('prueba cierre Ping correcta');
        expect(args.resolutionResult).not.toMatch(/indicando|Completa el compromiso/i);
        expect(result.steps[0].operation).toContain('dejar excavadora en parcela');
        expect(result.steps[0].provenance.canonicalSourceRefs).toContainEqual({ sourceType: 'commitment', sourceId: DEJAR_EXCAVADORA_ID });
    });

    it('a still-polluted entityHint (if one somehow reached the planner) never matches the real title via the honest substring filter -- entity_not_found, never a best-guess against the wrong record (this is the exact physical failure mode BEFORE the interpreter-level fix)', async () => {
        retrieveCommitmentsMock.mockResolvedValue([dejarExcavadoraFixture()]);
        const objective = baseObjective({
            objectiveType: 'complete_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('entity_not_found');
        expect(result.steps).toEqual([]);
    });

    it('two similarly-named commitments -> ambiguity, never silently completes an arbitrary one', async () => {
        retrieveCommitmentsMock.mockResolvedValue([
            dejarExcavadoraFixture({ id: 'c1' }),
            dejarExcavadoraFixture({ id: 'c2', title: 'dejar excavadora en parcela norte' }),
        ]);
        const objective = baseObjective({
            objectiveType: 'complete_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['dejar excavadora en parcela'] },
            desiredOutcome: 'prueba cierre Ping correcta',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0]?.field).toBe('targetEntity');
        expect(result.blockingAmbiguities[0]?.candidates).toHaveLength(2);
        expect(result.steps).toEqual([]);
    });

    it('nonexistent target -> entity_not_found, truthful no-evidence, never a fabricated match', async () => {
        retrieveCommitmentsMock.mockResolvedValue([]);
        const objective = baseObjective({
            objectiveType: 'complete_existing_commitment',
            targetEntities: { personHints: [], entityHints: ['dejar excavadora en parcela'] },
            desiredOutcome: 'prueba cierre Ping correcta',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('entity_not_found');
        expect(result.steps).toEqual([]);
    });
});

// ─── MEMORY-INFORMED PLANNING (sección 29/30, escenario H del ticket M-3) ──
function memoryFixture(overrides: Record<string, any> = {}) {
    return {
        id: 'mem-1', isCurrent: true, sensitivity: 'normal', confidence: 0.9,
        objectValue: 'el viernes', canonicalText: 'Alejandra prefiere el viernes',
        ...overrides,
    };
}

describe('MEMORY-INFORMED PLANNING: "Usa el horario que Alejandra prefiere" (sección 29/30, escenario H)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('sin fecha explícita pero con memoria vigente y no restringida cuyo texto sí es parseable -> se usa, declarado en provenance/preconditions', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFixture()]);
        parseDateFromTextMock.mockImplementation((text: string) => (text === 'el viernes' ? { date: new Date('2026-09-11T12:00:00.000Z'), textRef: 'el viernes' } : null));
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps[0].provenance.resolvedFrom).toBe('memory');
        expect(result.steps[0].provenance.canonicalSourceRefs).toContainEqual({ sourceType: 'memory', sourceId: 'mem-1' });
        expect(result.steps[0].preconditions.some((p) => p.includes('memoria'))).toBe(true);
    });

    it('memoria "restricted" NUNCA se usa, ni siquiera si es vigente y confiable (sección 30: cero fuga)', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFixture({ sensitivity: 'restricted' })]);
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0]?.field).toBe('dueAt');
    });

    it('memoria no vigente (isCurrent=false) NUNCA se usa -> sigue pidiendo aclaración', async () => {
        retrieveMemoryMock.mockResolvedValue([memoryFixture({ isCurrent: false })]);
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0]?.field).toBe('dueAt');
    });

    it('sin ninguna memoria disponible -> clarificación normal (sección 29: "otherwise clarification")', async () => {
        retrieveMemoryMock.mockResolvedValue([]);
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities[0]?.field).toBe('dueAt');
    });

    it('cuando ya hay una fecha explícita en el texto, la memoria nunca se consulta (la solicitud real siempre domina)', async () => {
        parseDateFromTextMock.mockReturnValue({ date: new Date('2026-09-08T11:00:00.000Z'), textRef: 'mañana' });
        const objective = baseObjective({ objectiveType: 'create_commitment_or_proposal', targetEntities: { personHints: [], entityHints: ['entrenar'] } });
        await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(retrieveMemoryMock).not.toHaveBeenCalled();
    });
});

describe('adversarial I: la memoria nunca puede filtrarse a un argumento de mensaje (sección 41)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('send_message.content siempre proviene del texto del usuario, nunca de memory.service.ts -- retrieveMemory jamás se invoca en el flujo de comunicación', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Llegaré tarde',
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(retrieveMemoryMock).not.toHaveBeenCalled();
        expect((result.steps[0].arguments as any).content).toBe('llegaré tarde');
        expect((result.steps[0].arguments as any).content).not.toMatch(/mem-|restricted|sensitive/i);
    });
});

describe('adversarial J: send_message.content -- contrato canónico VERBATIM (Core localiza/valida un candidato de texto real; jamás una tabla de conectores, jamás un offset propuesto, jamás desiredOutcome como fallback)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('Spanish natural form: "Dile a Alejandra que llegaré tarde" -> content congelado es exactamente "llegaré tarde" (candidato semántico verbatim, sin tabla de conectores)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra que llegaré tarde';
        // No hay ":" ni comillas -- el fast path determinístico (colon/quote,
        // cero tablas de conectores) no propone nada por diseño. Sólo un
        // intérprete semántico real podría identificar "llegaré tarde" como
        // el payload; simulamos exactamente esa propuesta como TEXTO
        // VERBATIM (nunca un offset) -- Core es quien prueba, de forma
        // independiente, que ese texto realmente ocurre en sourceUtterance.
        expect(communicateCandidate(sourceUtterance, 'Alejandra')).toBeNull();
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Inform Alejandra that I will arrive late', // paráfrasis LLM -- nunca debe usarse
            communicateContentCandidate: semanticVerbatimCandidate('llegaré tarde'),
            source: 'llm',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('send_message');
        expect((result.steps[0].arguments as any).content).toBe('llegaré tarde');
    });

    it('English natural form: "Tell Alejandra that I\'ll be late" -> content congelado es exactamente "I\'ll be late"', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = "Tell Alejandra that I'll be late";
        expect(communicateCandidate(sourceUtterance, 'Alejandra')).toBeNull();
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Avísale a Alejandra que llegaré tarde', // paráfrasis/traducción -- nunca debe usarse
            communicateContentCandidate: semanticVerbatimCandidate("I'll be late"),
            source: 'llm',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect((result.steps[0].arguments as any).content).toBe("I'll be late");
    });

    it('colon form: "Dile a Alejandra: llegaré tarde" -> exact source span, vía el fast path determinístico real (sin candidato semántico)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const candidate = communicateCandidate(sourceUtterance, 'Alejandra');
        expect(candidate).toEqual({ verbatimText: 'llegaré tarde', extractionMode: 'delimiter_colon' });
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'irrelevant',
            communicateContentCandidate: candidate,
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect((result.steps[0].arguments as any).content).toBe('llegaré tarde');
    });

    it('quoted form: \'Dile a Alejandra "llegaré tarde, nos vemos mañana"\' -> exact source span, vía el fast path determinístico real', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra "llegaré tarde, nos vemos mañana"';
        const candidate = communicateCandidate(sourceUtterance, 'Alejandra');
        expect(candidate).toEqual({ verbatimText: 'llegaré tarde, nos vemos mañana', extractionMode: 'delimiter_quote' });
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'irrelevant',
            communicateContentCandidate: candidate,
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect((result.steps[0].arguments as any).content).toBe('llegaré tarde, nos vemos mañana');
    });

    it('candidato traducido/parafraseado ("LLM malicioso") -> nunca coincide con ningún substring real -> rechazado (nunca ejecutable, nunca cae a desiredOutcome)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra que llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Inform Alejandra that I will arrive late',
            source: 'llm',
            // Un proposer que "traduce" en vez de copiar verbatim -- este
            // texto simplemente no existe en sourceUtterance, así que la
            // localización de Core falla por construcción (misma ruta que
            // "ausente", sin necesidad de detección de traducción alguna).
            communicateContentCandidate: semanticVerbatimCandidate('Inform Alejandra that I will arrive late'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities).toHaveLength(1);
        expect(result.blockingAmbiguities[0].field).toBe('messageContent');
    });

    it('candidato ausente del sourceUtterance real (nunca ocurrió) -> rechazado, clarification/non-ready', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            source: 'llm',
            communicateContentCandidate: semanticVerbatimCandidate('esto nunca aparece en el texto'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].field).toBe('messageContent');
    });

    it('ocurrencia duplicada/ambigua del candidato dentro de la región válida -> rechazado, nunca adivina cuál instancia usar', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        // "tarde" aparece dos veces después del nombre -- un candidato de
        // "tarde" sería ambiguo: Core nunca adivina cuál ocurrencia es la
        // real, rechaza por completo en vez de arriesgar la incorrecta.
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde, mejor que temprano y no tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            source: 'llm',
            communicateContentCandidate: semanticVerbatimCandidate('tarde'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].field).toBe('messageContent');
    });

    it('candidato que solapa el propio span de addressing del destinatario -> rechazado (nunca puede incluir el nombre como si fuera payload)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            source: 'llm',
            // "Alejandra" sólo ocurre UNA vez en todo el string -- dentro del
            // propio span de addressing -- así que buscarlo en la región
            // posterior al addressing (la única región válida) nunca
            // encuentra nada. Prueba que el addressing nunca puede colarse
            // como payload.
            communicateContentCandidate: semanticVerbatimCandidate('Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities[0].field).toBe('messageContent');
    });

    it('emoji / payload Unicode fuera del BMP (pares subrogados) -> preservación exacta, nunca corrompido por indexOf/slice', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra: 🎉 llegamos tarde 🎉 nos vemos pronto';
        const candidate = communicateCandidate(sourceUtterance, 'Alejandra');
        expect(candidate).toEqual({ verbatimText: '🎉 llegamos tarde 🎉 nos vemos pronto', extractionMode: 'delimiter_colon' });
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            communicateContentCandidate: candidate,
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect((result.steps[0].arguments as any).content).toBe('🎉 llegamos tarde 🎉 nos vemos pronto');
    });

    it('sin ninguna propuesta segura (sin ":", sin comillas, sin candidato semántico) -> ambigüedad bloqueante messageContent, NUNCA cae a desiredOutcome ni ejecuta un send_message', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const sourceUtterance = 'Dile a Alejandra sobre el proyecto';
        expect(communicateCandidate(sourceUtterance, 'Alejandra')).toBeNull();
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'Llegaré tarde', // nunca debe filtrarse a un step ejecutable
            source: 'llm',
            communicateContentCandidate: null,
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities).toHaveLength(1);
        expect(result.blockingAmbiguities[0].field).toBe('messageContent');
        expect(result.blockingAmbiguities[0].kind).toBe('blocking');
    });

    it('resolución de conversación directa global sigue funcionando sin cambios cuando el content sí es seguro (nunca se ve afectada por el gate de contenido)', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            desiredOutcome: 'irrelevant llm restatement',
            source: 'llm',
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].arguments).toMatchObject({ conversationId: CONVERSATION_ID, content: 'llegaré tarde' });
        expect(result.steps[0].provenance.resolvedFrom).toBe('global_conversation_resolution');
    });

    it('planObjective (Core planning) nunca invoca ninguna operación de escritura/envío -- /agent/turn permanece zero-write antes de autorización', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const sourceUtterance = 'Dile a Alejandra: llegaré tarde';
        const objective = baseObjective({
            objectiveType: 'communicate_message',
            targetEntities: { personHints: ['Alejandra'], entityHints: [] },
            sourceUtterance,
            communicateContentCandidate: communicateCandidate(sourceUtterance, 'Alejandra'),
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        // planCommunicate/planObjective sólo llaman resolvePerson y
        // resolveDirectConversation (ambas lecturas puramente de
        // identidad/routing, ya mockeadas arriba) -- ninguna función de
        // envío/ejecución existe en este módulo en absoluto (ver el
        // comentario de cabecera de agentPlanner.service.ts: "NEVER calls a
        // write RPC, NEVER sends a message"). El plan resultante nunca trae
        // un status ejecutado -- eso lo certifica end-to-end
        // agentTurn.test.ts (kind=plan, plan.status !== 'executed').
        expect(result.steps[0].status).toBe('pending');
        expect(result.steps[0].toolId).toBe('send_message');
    });
});

describe('objectiveType unsupported -> failureMode unsupported_capability, nunca inventa un plan (sección 31)', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');
    it('unsupported', async () => {
        const objective = baseObjective({ objectiveType: 'unsupported' });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBe('unsupported_capability');
        expect(result.steps).toEqual([]);
    });
});

// PING — AGENT RESPONSE LANGUAGE CONSISTENCY. Physical iPhone failure: the
// Spanish request "Borra definitivamente todos mis compromisos y elimina
// todos sus registros históricos" was correctly capability-gapped (no
// destructive-deletion capability exists, never will via this path), but
// the body text came back in English -- "I can't plan an action for that
// request yet...". ROOT CAUSE (proven, not guessed): this was the ONLY
// hardcoded-English failureMessage anywhere in agentPlanner.service.ts --
// all 9 other failureMessage sites are already hand-written Spanish. The
// planner had ZERO language awareness (no `locale` field on
// AgentPlannerInput at all) even though agentPlanOrchestrator.service.ts's
// own input already carried `locale` (threaded from agentTurn.service.ts)
// -- it was silently dropped at the exact boundary where plannerInput was
// constructed, never reaching planObjectiveDraft. Fixed by (1) adding
// `locale` to AgentPlannerInput, (2) actually copying it into plannerInput
// in the orchestrator, (3) using detectAgentLanguage (utils/agentLanguage.ts,
// the SAME canonical detector agentResponseSynthesizer.service.ts already
// used for its own capability_gap/no_evidence templates -- moved there so
// both layers share one detector, never two) to pick the failureMessage
// language for objectiveType 'unsupported'.
describe('PING — AGENT RESPONSE LANGUAGE CONSISTENCY: objectiveType unsupported failureMessage follows the user language, never hardcoded English', async () => {
    const { planObjective } = await import('../src/services/agentPlanner.service');

    it('REAL PHYSICAL FIXTURE: Spanish "Borra definitivamente todos mis compromisos y elimina todos sus registros históricos" -> Spanish failureMessage, NEVER "I can\'t plan an action..."', async () => {
        const objective = baseObjective({
            objectiveType: 'unsupported',
            sourceUtterance: 'Borra definitivamente todos mis compromisos y elimina todos sus registros históricos',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date(), locale: 'es-CL' });
        expect(result.failureMode).toBe('unsupported_capability');
        expect(result.steps).toEqual([]);
        expect(result.failureMessage).not.toMatch(/I can't plan an action/i);
        expect(result.failureMessage).toMatch(/todavía no puedo realizar esa acción/i);
    });

    it('Spanish detected purely from sourceUtterance when locale is absent -- same result, locale is the primary signal but never the only one', async () => {
        const objective = baseObjective({
            objectiveType: 'unsupported',
            sourceUtterance: 'Borra definitivamente todos mis compromisos y elimina todos sus registros históricos',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMessage).not.toMatch(/I can't plan an action/i);
        expect(result.failureMessage).toMatch(/todavía no puedo realizar esa acción/i);
    });

    it('English unsupported request with locale="en-US" -> English failureMessage preserved, never translated to Spanish', async () => {
        const objective = baseObjective({
            objectiveType: 'unsupported',
            sourceUtterance: 'Permanently delete all my commitments and erase all their historical records',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date(), locale: 'en-US' });
        expect(result.failureMode).toBe('unsupported_capability');
        expect(result.failureMessage).toMatch(/I can't plan an action/i);
        expect(result.failureMessage).not.toMatch(/todavía no puedo/i);
    });

    it('English detected purely from sourceUtterance when locale is absent -- same result', async () => {
        const objective = baseObjective({
            objectiveType: 'unsupported',
            sourceUtterance: 'Permanently delete all my commitments and erase all their historical records',
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMessage).toMatch(/I can't plan an action/i);
    });

    it('failureMode itself is NEVER translated -- internal enum stays "unsupported_capability" regardless of language', async () => {
        const es = await planObjective({ objective: baseObjective({ objectiveType: 'unsupported', sourceUtterance: 'Borra todo' }), actorUserId: CARLOS, now: new Date(), locale: 'es-CL' });
        const en = await planObjective({ objective: baseObjective({ objectiveType: 'unsupported', sourceUtterance: 'Delete everything' }), actorUserId: CARLOS, now: new Date(), locale: 'en-US' });
        expect(es.failureMode).toBe('unsupported_capability');
        expect(en.failureMode).toBe('unsupported_capability');
    });

    it('no executable plan/step is ever created for the destructive-deletion request in either language -- capability-gapped, never silently planned', async () => {
        const es = await planObjective({ objective: baseObjective({ objectiveType: 'unsupported', sourceUtterance: 'Borra definitivamente todos mis compromisos' }), actorUserId: CARLOS, now: new Date(), locale: 'es-CL' });
        expect(es.steps).toEqual([]);
        expect(es.blockingAmbiguities).toEqual([]);
    });
});

// M-8 — remember_fact planning. Mirrors validateCommunicateContent's own
// test coverage style (verbatim-substring proof, never trust the
// interpreter's own extracted fragment as automatically correct).
describe('M-8: planObjective — remember_fact (Core-verified verbatim content, no LLM/free-text trust)', () => {
    it('a genuine verbatim fragment of sourceUtterance produces a real remember_fact step', async () => {
        const objective = baseObjective({
            objectiveType: 'remember_fact',
            sourceUtterance: 'Recuerda que mi hermano se llama Andrés',
            targetEntities: { personHints: [], entityHints: ['mi hermano se llama Andrés'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('remember_fact');
        expect(result.steps[0].arguments).toEqual({ factContent: 'mi hermano se llama Andrés' });
    });

    it('an empty entityHints (no fact content extracted) blocks with factContent ambiguity, never plans an empty-content step', async () => {
        const objective = baseObjective({
            objectiveType: 'remember_fact',
            sourceUtterance: 'Recuerda que',
            targetEntities: { personHints: [], entityHints: [] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities).toEqual([{ field: 'factContent', kind: 'blocking', reason: 'No identifiqué qué quieres que recuerde.' }]);
    });

    it('SECURITY: a candidate that is NOT a real substring of sourceUtterance (e.g. an LLM-paraphrased/invented fragment, in a future LLM-enabled iteration) is rejected, never planned as-is', async () => {
        const objective = baseObjective({
            objectiveType: 'remember_fact',
            sourceUtterance: 'Recuerda que mi hermano se llama Andrés',
            // Simulates a hypothetical future interpreter path proposing
            // paraphrased/invented content instead of the real fragment --
            // this MUST be rejected exactly like a hallucinated
            // communicate_message candidate would be.
            targetEntities: { personHints: [], entityHints: ['Su hermano se llama Andrés Pérez'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities).toEqual([{ field: 'factContent', kind: 'blocking', reason: 'No pude confirmar exactamente qué texto quieres que recuerde.' }]);
    });

    it('SECURITY: an ambiguous candidate matching 2+ locations in sourceUtterance is rejected, never guesses which occurrence', async () => {
        const objective = baseObjective({
            objectiveType: 'remember_fact',
            sourceUtterance: 'Recuerda que Andrés y Andrés son la misma persona',
            targetEntities: { personHints: [], entityHints: ['Andrés'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps).toEqual([]);
        expect(result.blockingAmbiguities).toEqual([{ field: 'factContent', kind: 'blocking', reason: 'No pude confirmar exactamente qué texto quieres que recuerde.' }]);
    });

    it('remember_fact requires only actor_identity authorization -- no conversation/commitment scope, since a personal memory has none', async () => {
        const objective = baseObjective({
            objectiveType: 'remember_fact',
            sourceUtterance: 'Recuerda que prefiero reuniones por la mañana',
            targetEntities: { personHints: [], entityHints: ['prefiero reuniones por la mañana'] },
        });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.steps[0].authorizationRequirement).toBe('actor_identity');
        expect(result.steps[0].confirmationRequirement).toBe('explicit');
        expect(result.steps[0].sideEffectClass).toBe('state_change');
    });
});
