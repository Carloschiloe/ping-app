import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { RetrievalCommitment, RetrievalPerson } from '../src/types/retrieval';
import type { AgentObjective } from '../src/types/agentPlan';

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

    it('persona resuelta -> un step send_message', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        const objective = baseObjective({ objectiveType: 'communicate_message', targetEntities: { personHints: ['Alejandra'], entityHints: [] }, desiredOutcome: 'Llegaré tarde' });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('send_message');
        expect(result.steps[0].arguments).toMatchObject({ recipientPersonId: ALEJANDRA_ID, content: 'Llegaré tarde' });
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

    it('sin conversationId pero con persona y conversación directas resueltas -> draft normal sin bloqueo', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: CONVERSATION_ID, ambiguous: false, candidateCount: 1 });
        const objective = baseObjective({ targetEntities: { personHints: ['Alejandra'], entityHints: [] }, desiredOutcome: 'Llegaré tarde' });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.failureMode).toBeUndefined();
        expect(result.blockingAmbiguities).toEqual([]);
        expect(result.steps).toHaveLength(1);
        expect(result.steps[0].toolId).toBe('send_message');
        expect(result.steps[0].arguments).toMatchObject({ recipientPersonId: ALEJANDRA_ID, conversationId: CONVERSATION_ID, content: 'Llegaré tarde' });
        expect(result.steps[0].provenance.canonicalSourceRefs).toContainEqual({ sourceType: 'conversation', sourceId: CONVERSATION_ID });
    });

    it('sin conversationId, persona resuelta pero conversación ambigua -> ambigüedad bloqueante', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: null, ambiguous: true, candidateCount: 2 });
        const objective = baseObjective({ targetEntities: { personHints: ['Alejandra'], entityHints: [] }, desiredOutcome: 'Llegaré tarde' });
        const result = await planObjective({ objective, actorUserId: CARLOS, now: new Date() });
        expect(result.blockingAmbiguities).toHaveLength(1);
        expect(result.blockingAmbiguities[0].field).toBe('conversation');
        expect(result.blockingAmbiguities[0].reason).toContain('2 conversaciones directas');
    });

    it('sin conversationId, persona resuelta pero sin conversación directa -> ambigüedad bloqueante', async () => {
        resolvePersonMock.mockResolvedValue({ resolved: alejandraPerson, ambiguous: false, candidates: [] });
        resolveDirectConversationMock.mockResolvedValue({ conversationId: null, ambiguous: false, candidateCount: 0 });
        const objective = baseObjective({ targetEntities: { personHints: ['Alejandra'], entityHints: [] }, desiredOutcome: 'Llegaré tarde' });
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
        const objective = baseObjective({
            objectiveType: 'communicate_and_wait',
            targetEntities: { personHints: ['Alejandra'], entityHints: ['entrenar'] },
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
        const objective = baseObjective({ objectiveType: 'communicate_message', targetEntities: { personHints: ['Alejandra'], entityHints: [] }, desiredOutcome: 'Llegaré tarde' });
        const result = await planObjective({ objective, actorUserId: CARLOS, conversationId: CONVERSATION_ID, now: new Date() });
        expect(retrieveMemoryMock).not.toHaveBeenCalled();
        expect((result.steps[0].arguments as any).content).toBe('Llegaré tarde');
        expect((result.steps[0].arguments as any).content).not.toMatch(/mem-|restricted|sensitive/i);
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
