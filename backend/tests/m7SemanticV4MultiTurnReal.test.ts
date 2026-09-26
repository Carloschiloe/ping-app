import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentObjective } from '../src/types/agentPlan';
import type { NormalizedSemanticTurnV4, TemporalFactV3 } from '../src/types/agentTurnCommit';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { SemanticV4Diagnostics } from '../src/services/canonicalSemanticProducer.service';
import {
    AgentSemanticV4HighFidelityReadOnlyResolver,
    createHighFidelityReadOnlyRepositoryForTest,
} from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { AgentDialogueStateService, clearAgentDialogueStateForTests } from '../src/services/agentDialogueState.service';
import { resolveTemporal } from '../src/services/temporalCore.service';

const ACTOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REFERENCE_INSTANT = '2026-09-26T15:00:00.000Z';
const TIMEZONE = 'America/Santiago';

type ReadTarget = 'commitment' | 'person' | 'message' | 'proposal';
type TurnRoute = 'read' | 'write';
type TurnKind = 'read_request' | 'write_request' | 'lifecycle_command' | 'slot_answer';
type RepositoryKind = 'unique' | 'people' | 'messages' | 'ambiguous' | 'empty';

interface TurnSpec {
    utterance: string;
    route: TurnRoute;
    kind: TurnKind;
    title?: string;
    person?: string;
    target?: ReadTarget;
    collection?: boolean;
    incomplete?: boolean;
    slot?: { type: string; value: string };
    lifecycle?: 'abandon' | 'resume';
    temporalFact?: TemporalFactV3;
}

interface ConversationSpec {
    id: string;
    label: string;
    repository: RepositoryKind;
    turns: [TurnSpec, TurnSpec, TurnSpec, TurnSpec];
}

const diagnostics: SemanticV4Diagnostics = {
    schemaValid: true,
    failure: null,
    providerRequestSucceeded: true,
    providerFailure: false,
    providerErrorClass: null,
    providerHttpStatus: null,
    providerErrorCode: null,
    providerErrorMessage: null,
    finishReason: 'stop',
    refusalPresent: false,
    contentPresent: true,
    contentLength: 12,
    normalizationSuccess: true,
    fallbackReason: null,
    model: 'development-precomputed-v4',
    latencyMs: 1,
    usage: { inputTokens: null, outputTokens: null, totalTokens: null, reasoningTokens: null },
};

function readMeaning(turn: TurnSpec): NormalizedSemanticTurnV4['readMeaning'] {
    if (turn.route !== 'read') return null;
    const target = turn.target ?? 'commitment';
    return {
        queryShape: turn.collection ? 'collection' : 'focused',
        explicitCollection: Boolean(turn.collection),
        targetShape: target,
        relationship: target === 'person'
            ? { kind: 'person_relationship' }
            : target === 'message'
                ? { kind: 'message_relationship', relationship: 'content' }
                : { kind: 'general_recall' },
        temporalRole: turn.temporalFact ? 'filter_range' : 'none',
        commitmentStatus: null,
    };
}

function semantic(turn: TurnSpec): NormalizedSemanticTurnV4 {
    const slots: Record<string, string | number | boolean | null> = {};
    if (turn.title) slots.title = turn.title;
    if (turn.person) slots.person = turn.person;
    if (turn.slot) slots[turn.slot.type] = turn.slot.value;
    return {
        version: 4,
        kind: turn.kind,
        domain: turn.route === 'read' ? 'commitment' : 'commitment',
        objectiveCompleteness: turn.route === 'read' ? 'complete' : turn.incomplete ? 'incomplete' : 'complete',
        lifecycleCommand: turn.lifecycle ?? 'none',
        lifecycleTarget: turn.lifecycle ? 'active' : 'unspecified',
        lifecycleEvidence: turn.lifecycle ? 'explicit' : 'unknown',
        pendingSlotAnswer: turn.kind === 'slot_answer' ? 'likely' : 'not_a_slot_answer',
        continuationLike: turn.kind === 'slot_answer' ? 'yes' : 'unknown',
        candidateSlotType: turn.slot?.type ?? null,
        independentObjective: turn.route === 'write' && turn.kind === 'write_request' ? 'yes' : 'no',
        objectiveType: turn.route === 'write' ? 'create_personal_commitment' : null,
        entityHints: turn.title ? [turn.title] : [],
        slots,
        ambiguityFields: turn.target === 'commitment' && turn.collection ? [] : [],
        confidence: 0.94,
        source: 'llm',
        readMeaning: readMeaning(turn),
        ...(turn.temporalFact ? { temporalFact: turn.temporalFact } : {}),
    };
}

function objective(turn: TurnSpec, index: number): AgentObjective {
    const title = turn.title ?? `objetivo de conversación ${index}`;
    const rawHint = turn.temporalFact
        ? turn.utterance
        : turn.slot?.type === 'time'
            ? turn.slot.value
            : turn.utterance;
    return {
        objectiveType: 'create_personal_commitment',
        targetEntities: { personHints: turn.person ? [turn.person] : [], entityHints: [title] },
        constraints: {},
        desiredOutcome: title,
        timeConstraints: { rawHint },
        actor: ACTOR,
        sourceUtterance: `${title} ${rawHint}`,
        confidence: 0.91,
        ambiguities: [],
        source: 'llm',
    };
}

function legacy(turn: TurnSpec, index: number): AgentSemanticInterpretation {
    return {
        route: turn.route,
        objective: turn.route === 'write' ? objective(turn, index) : null,
        interpretation: {
            intent: turn.route === 'write' ? 'create_commitment' : 'commitment_query',
            intentConfidence: 0.91,
            personHints: turn.person ? [turn.person] : [],
            topicHints: turn.title ? [turn.title] : [],
            textQuery: turn.title ?? null,
            timeExpression: turn.temporalFact ? turn.utterance : null,
            statusHints: null,
            requestedTransition: turn.lifecycle ?? null,
            wantsCommitments: turn.route === 'read',
            wantsMessages: turn.target === 'message',
            wantsTranscriptions: false,
            wantsAttachments: false,
            wantsOverdueFocus: false,
            proposalFocus: null,
            isWriteActionRequest: turn.route === 'write',
            ambiguityHints: [],
            source: 'llm',
            modelUsed: 'development-legacy-fixture',
        },
    } as AgentSemanticInterpretation;
}

function commitment(id: string, title: string, conversationId: string, personId?: string): any {
    return {
        id,
        entityType: 'commitment',
        title,
        description: null,
        status: 'accepted',
        type: 'task',
        priority: null,
        dueAt: '2026-09-29T20:00:00.000Z',
        proposedDueAt: null,
        expectedResult: null,
        resolvedAt: null,
        resolutionResult: null,
        rejectionReason: null,
        ownerUserId: ACTOR,
        assignedToUserId: personId ?? null,
        counterpartyContactId: null,
        conversationId,
        messageId: null,
        createdAt: '2026-09-26T10:00:00.000Z',
        provenance: { sourceType: 'commitment', sourceId: id },
        authorizedActorUserIds: [ACTOR],
    };
}

function repository(kind: RepositoryKind, conversationId: string) {
    if (kind === 'empty') return createHighFidelityReadOnlyRepositoryForTest();
    if (kind === 'people') return createHighFidelityReadOnlyRepositoryForTest({
        people: [
            { actorUserId: ACTOR, person: { kind: 'user', id: '55555555-5555-4555-8555-555555555555', displayName: 'Pedro' } },
            { actorUserId: ACTOR, person: { kind: 'contact', id: '66666666-6666-4666-8666-666666666666', displayName: 'Paula' } },
        ],
        commitments: [commitment('77777777-7777-4777-8777-777777777777', 'llamar a Pedro', conversationId, '55555555-5555-4555-8555-555555555555')],
    });
    if (kind === 'messages') return createHighFidelityReadOnlyRepositoryForTest({
        messages: [{
            id: '88888888-8888-4888-8888-888888888888', conversationId, senderId: ACTOR,
            content: 'la reunión queda para el martes', isSystem: false, createdAt: '2026-09-26T10:00:00.000Z',
            provenance: { sourceType: 'message', sourceId: '88888888-8888-4888-8888-888888888888' },
            authorizedActorUserIds: [ACTOR],
        } as any],
    });
    if (kind === 'ambiguous') return createHighFidelityReadOnlyRepositoryForTest({
        commitments: [
            commitment('99999999-9999-4999-8999-999999999999', 'revisar el informe', conversationId),
            commitment('aaaaaaaa-bbbb-4aaa-8bbb-aaaaaaaaaaaa', 'revisar el informe', conversationId),
        ],
    });
    return createHighFidelityReadOnlyRepositoryForTest({
        commitments: [
            commitment('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'revisar el informe', conversationId),
            commitment('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'reservar la sala', conversationId),
        ],
    });
}

const day = (amount: number): TemporalFactV3 => ({ kind: 'relative_date', precision: 'date', amount, unit: 'days' });
const nextFriday: TemporalFactV3 = { kind: 'weekday', precision: 'date', weekday: 5, relation: 'next' };
const timeFive: TemporalFactV3 = { kind: 'time_only', precision: 'minute', hour: 5, minute: 0, meridiem: 'pm', ambiguity: 'none' };
const twoHours: TemporalFactV3 = { kind: 'relative_target_offset', precision: 'elapsed', amount: 2, unit: 'hours' };
const twoHourDuration: TemporalFactV3 = { kind: 'relative_duration', precision: 'duration', amount: 2, unit: 'hours' };

function r(utterance: string, extra: Partial<TurnSpec> = {}): TurnSpec { return { utterance, route: 'read', kind: 'read_request', target: 'commitment', ...extra }; }
function w(utterance: string, title: string, extra: Partial<TurnSpec> = {}): TurnSpec { return { utterance, route: 'write', kind: 'write_request', title, ...extra }; }
function life(utterance: string, lifecycle: 'abandon' | 'resume', title: string): TurnSpec { return { utterance, route: 'write', kind: 'lifecycle_command', lifecycle, title }; }
function slot(utterance: string, type: string, value: string, title: string): TurnSpec { return { utterance, route: 'write', kind: 'slot_answer', slot: { type, value }, title, incomplete: true }; }

const conversations: ConversationSpec[] = [
    { id: 'c01', label: 'objetivo incompleto a datos completos', repository: 'unique', turns: [
        w('Anota revisar el contrato', 'revisar el contrato', { incomplete: true }),
        slot('para mañana', 'time', 'mañana', 'revisar el contrato'),
        slot('mejor a las cinco', 'time', 'mañana a las cinco', 'revisar el contrato'),
        w('sí, déjalo preparado', 'revisar el contrato'),
    ] },
    { id: 'c02', label: 'persona y pronombre', repository: 'people', turns: [
        r('¿Qué quedó pendiente con Pedro?', { target: 'person', person: 'Pedro' }),
        r('¿Y él ya respondió?', { target: 'person', person: 'Pedro' }),
        r('Muéstrame lo de esa persona', { target: 'person', person: 'Pedro' }),
        r('¿Qué sigue después?', { target: 'commitment', title: 'llamar a Pedro' }),
    ] },
    { id: 'c03', label: 'objeto y eso', repository: 'unique', turns: [
        r('Recuérdame el pendiente del informe', { title: 'revisar el informe' }),
        r('¿Y eso cuándo vence?', { title: 'revisar el informe', temporalFact: day(1) }),
        r('¿A quién le corresponde eso?', { title: 'revisar el informe' }),
        r('¿Por qué quedó pendiente?', { title: 'revisar el informe' }),
    ] },
    { id: 'c04', label: 'anterior y otro', repository: 'unique', turns: [
        r('Lista mis compromisos de esta semana', { collection: true }),
        r('¿Cuál era el anterior?', { title: 'revisar el informe' }),
        r('¿Y el otro?', { title: 'reservar la sala' }),
        r('Dame más detalles del anterior', { title: 'revisar el informe' }),
    ] },
    { id: 'c05', label: 'confirmación tardía', repository: 'unique', turns: [
        w('Quiero dejar listo el presupuesto', 'dejar listo el presupuesto', { incomplete: true }),
        w('Que sea para el viernes', 'dejar listo el presupuesto', { temporalFact: nextFriday }),
        r('¿Qué vas a crear exactamente?', { title: 'dejar listo el presupuesto' }),
        w('Sí, adelante con eso', 'dejar listo el presupuesto'),
    ] },
    { id: 'c06', label: 'rechazo tardío', repository: 'unique', turns: [
        w('Agrega llamar al proveedor', 'llamar al proveedor'),
        r('¿Qué plan quedó abierto?', { title: 'llamar al proveedor' }),
        life('No, cancela ese plan', 'abandon', 'llamar al proveedor'),
        r('¿Qué me queda entonces?', { title: 'llamar al proveedor' }),
    ] },
    { id: 'c07', label: 'corrección inmediata', repository: 'unique', turns: [
        w('Recuérdame enviar la cotización mañana', 'enviar la cotización', { temporalFact: day(1) }),
        w('No, el jueves', 'enviar la cotización', { temporalFact: nextFriday }),
        w('En realidad a las cinco', 'enviar la cotización', { temporalFact: timeFive }),
        r('¿Cuál es la fecha final?', { title: 'enviar la cotización' }),
    ] },
    { id: 'c08', label: 'corrección varios turnos después', repository: 'unique', turns: [
        w('Programa revisar los planos', 'revisar los planos', { temporalFact: day(1) }),
        r('También tengo que coordinar la visita', { title: 'coordinar la visita' }),
        r('Volviendo a lo primero, mejor pasado mañana', { title: 'revisar los planos', temporalFact: day(2) }),
        r('¿A qué hora queda lo primero?', { title: 'revisar los planos', temporalFact: timeFive }),
    ] },
    { id: 'c09', label: 'cambio de fecha', repository: 'unique', turns: [
        w('Anota presentar el informe el viernes', 'presentar el informe', { temporalFact: nextFriday }),
        w('No, el próximo viernes', 'presentar el informe', { temporalFact: nextFriday }),
        r('¿Eso es esta semana o la siguiente?', { title: 'presentar el informe' }),
        w('Déjalo para mañana', 'presentar el informe', { temporalFact: day(1) }),
    ] },
    { id: 'c10', label: 'cambio de hora', repository: 'unique', turns: [
        w('Recuérdame llamar a soporte a las cinco', 'llamar a soporte', { temporalFact: timeFive }),
        w('Mejor a las seis', 'llamar a soporte', { temporalFact: { ...timeFive, hour: 6 } }),
        r('¿En qué fecha quedó?', { title: 'llamar a soporte' }),
        r('¿Y cuánto falta?', { title: 'llamar a soporte', temporalFact: twoHours }),
    ] },
    { id: 'c11', label: 'mañana a pasado mañana', repository: 'unique', turns: [
        w('Pon limpiar la bodega para mañana', 'limpiar la bodega', { temporalFact: day(1) }),
        w('Mejor pasado mañana', 'limpiar la bodega', { temporalFact: day(2) }),
        r('¿Eso cae qué día?', { title: 'limpiar la bodega', temporalFact: day(2) }),
        r('¿Sigue pendiente?', { title: 'limpiar la bodega' }),
    ] },
    { id: 'c12', label: 'viernes próximo y este', repository: 'unique', turns: [
        w('Agrega pagar la cuenta este viernes', 'pagar la cuenta', { temporalFact: { kind: 'weekday', precision: 'date', weekday: 5, relation: 'this_or_next' } }),
        w('No, el próximo', 'pagar la cuenta', { temporalFact: nextFriday }),
        r('¿Cuánto dura el trámite?', { title: 'pagar la cuenta', temporalFact: twoHourDuration }),
        r('¿Qué otro pendiente tengo?', { collection: true }),
    ] },
    { id: 'c13', label: 'cancelación de algo mencionado', repository: 'unique', turns: [
        w('Déjame pendiente comprar tinta', 'comprar tinta'),
        r('Anota también ordenar papeles', 'ordenar papeles'),
        life('Olvida lo de la tinta', 'abandon', 'comprar tinta'),
        r('¿Qué quedó vigente?', { collection: true }),
    ] },
    { id: 'c14', label: 'retomar objetivo abierto', repository: 'unique', turns: [
        w('Quiero preparar la reunión', 'preparar la reunión', { incomplete: true }),
        r('Tengo otra consulta rápida', { collection: true }),
        life('Volvamos a la reunión', 'resume', 'preparar la reunión'),
        slot('a las cinco', 'time', 'a las cinco', 'preparar la reunión'),
    ] },
    { id: 'c15', label: 'abandonar objetivo', repository: 'unique', turns: [
        w('Ayúdame a coordinar el despacho', 'coordinar el despacho', { incomplete: true }),
        slot('con Pedro', 'person', 'Pedro', 'coordinar el despacho'),
        life('Déjalo, no lo hagamos', 'abandon', 'coordinar el despacho'),
        r('¿Qué pendientes siguen?', { collection: true }),
    ] },
    { id: 'c16', label: 'tema A, tema B, volver a A', repository: 'unique', turns: [
        w('Anota revisar la presentación', 'revisar la presentación'),
        r('¿Qué mensajes tengo sobre la reunión?', { target: 'message', title: 'la reunión' }),
        r('Volviendo a la presentación, ¿qué faltaba?', { title: 'revisar la presentación' }),
        w('Corrige la fecha para mañana', 'revisar la presentación', { temporalFact: day(1) }),
    ] },
    { id: 'c17', label: 'dos personas distintas', repository: 'people', turns: [
        r('¿Qué debo coordinar con Pedro?', { target: 'person', person: 'Pedro' }),
        r('¿Y con Paula?', { target: 'person', person: 'Paula' }),
        r('¿Cuál de los dos respondió?', { target: 'person', person: 'Pedro' }),
        r('Muéstrame la tarea de Pedro', { title: 'llamar a Pedro' }),
    ] },
    { id: 'c18', label: 'dos compromisos parecidos y ambigüedad', repository: 'ambiguous', turns: [
        r('¿Qué pasa con revisar el informe?', { title: 'revisar el informe' }),
        r('¿Y eso para cuándo?', { title: 'revisar el informe', temporalFact: day(1) }),
        r('El de la mañana', { title: 'revisar el informe' }),
        r('No sé cuál, acláramelo', { title: 'revisar el informe' }),
    ] },
    { id: 'c19', label: 'negación, elipsis y coloquialismo', repository: 'empty', turns: [
        r('Oye, qué onda con mis pendientes', { collection: true }),
        r('No, eso no', { title: 'tema inexistente' }),
        r('Ya, muéstrame nada más lo de hoy', { collection: true, temporalFact: day(0) }),
        r('¿Hay algo o cero?', { collection: true }),
    ] },
    { id: 'c20', label: 'READ, WRITE, cambio y retorno', repository: 'messages', turns: [
        r('¿Qué se dijo sobre la reunión?', { target: 'message', title: 'la reunión' }),
        w('Agrega preparar la minuta', 'preparar la minuta', { temporalFact: day(1) }),
        w('No, mejor después de almuerzo', 'preparar la minuta', { temporalFact: twoHourDuration }),
        r('¿Qué mensaje originó eso?', { target: 'message', title: 'la reunión' }),
    ] },
];

vi.mock('../src/services/retrieval.service', () => ({
    resolvePerson: vi.fn(async () => ({ resolved: null, ambiguous: false, candidates: [] })),
    retrieveCommitments: vi.fn(async () => []),
    retrieveCommitmentProposals: vi.fn(async () => []),
    retrieveCommitmentEvents: vi.fn(async () => []),
    retrieveMessages: vi.fn(async () => []),
    retrieveTranscriptions: vi.fn(async () => []),
    retrieveAttachments: vi.fn(async () => []),
    retrieveVisibleCommitmentById: vi.fn(async () => null),
    dedupeProvenance: (items: any[]) => items,
}));

vi.mock('../src/services/memory.service', () => ({
    retrieveMemory: vi.fn(async () => []),
    ingestMemoryFromEvent: vi.fn(async () => undefined),
}));

vi.mock('../src/lib/supabaseAdmin', () => ({ supabaseAdmin: { from: vi.fn() } }));

describe('M-7 local multi-turn development matrix on the real Agent Turn boundary', () => {
    beforeEach(() => {
        process.env.NODE_ENV = 'test';
        process.env.PING_ENVIRONMENT = 'local';
        process.env.PING_SEMANTIC_V4_SHADOW = 'true';
        process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
        clearAgentDialogueStateForTests();
    });

    it('runs 20 new conversations / 80 turns with real state carry-over and no side effects', async () => {
        const { runAgentTurn } = await import('../src/services/agentTurn.service');
        expect(conversations).toHaveLength(20);
        expect(conversations.reduce((total, item) => total + item.turns.length, 0)).toBeGreaterThanOrEqual(80);

        let totalTurns = 0;
        let shadowPasses = 0;
        let shadowFailures = 0;
        let writePlans = 0;
        let readTurns = 0;
        let temporalTurns = 0;
        let stateCarryoverPasses = 0;
        let sideEffects = 0;

        for (const conversation of conversations) {
            const conversationId = `11111111-1111-4111-8111-${conversation.id.slice(1).padEnd(12, '0')}`;
            const dialogueService = new AgentDialogueStateService();
            const telemetry: any[] = [];
            const repo = repository(conversation.repository, conversationId);
            let previousSequence = 0;

            for (const [index, turn] of conversation.turns.entries()) {
                totalTurns += 1;
                if (turn.route === 'read') readTurns += 1;
                if (turn.temporalFact) {
                    temporalTurns += 1;
                    const temporal = resolveTemporal({
                        temporalFact: turn.temporalFact,
                        timezone: TIMEZONE,
                        turnReferenceInstant: REFERENCE_INSTANT,
                    });
                    expect(['resolved', 'ambiguous', 'insufficient']).toContain(temporal.status);
                }

                const result = await runAgentTurn({
                    actorUserId: ACTOR,
                    conversationId,
                    channel: 'mobile_text',
                    locale: 'es-CL',
                    timezone: TIMEZONE,
                    now: new Date(REFERENCE_INSTANT),
                    input: turn.utterance,
                }, {
                    dialogueService,
                    inputInterpreter: { interpret: async () => legacy(turn, index) as any },
                    objectiveInterpreter: { interpret: async () => objective(turn, index) },
                    precomputedSemanticV4: { semantic: semantic(turn), diagnostics },
                    semanticV4CoreShadowResolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repo),
                    semanticV4CoreShadowObserver: value => telemetry.push(value),
                });

                expect(result).toBeTruthy();
                const current = telemetry[telemetry.length - 1];
                expect(current).toBeTruthy();
                if (current.failure) shadowFailures += 1;
                else shadowPasses += 1;
                expect(current.failure, `${conversation.id}:${index + 1}`).toBeNull();
                expect(current.sideEffects).toEqual({
                    toolsExecuted: false,
                    persistenceWrites: 0,
                    dialogueStateMutated: false,
                    legacyResultChanged: false,
                });
                expect(current.core.planShape?.requiresAuthorization ?? false).toBe(false);
                expect(current.core.planShape?.requiresExecution ?? false).toBe(false);

                if (turn.route === 'write' && current.core.planShape?.route === 'write') writePlans += 1;
                const snapshot = dialogueService.getSnapshot(ACTOR, conversationId);
                if (snapshot) {
                    expect(snapshot.lastTurnSequence).toBeGreaterThanOrEqual(previousSequence);
                    if (snapshot.lastTurnSequence > previousSequence) stateCarryoverPasses += 1;
                    previousSequence = snapshot.lastTurnSequence;
                }
                if ((result as any).kind === 'plan') {
                    expect((result as any).plan).toBeTruthy();
                }
                if (current.sideEffects.toolsExecuted || current.sideEffects.persistenceWrites !== 0) sideEffects += 1;
            }
        }

        expect(totalTurns).toBe(80);
        expect(readTurns).toBeGreaterThan(0);
        expect(temporalTurns).toBeGreaterThanOrEqual(15);
        expect(shadowPasses).toBe(80);
        expect(shadowFailures).toBe(0);
        expect(writePlans).toBeGreaterThan(0);
        expect(stateCarryoverPasses).toBeGreaterThan(0);
        expect(sideEffects).toBe(0);
    });
});
