import type { NormalizedSemanticTurnV4 } from '../../src/types/agentTurnCommit';

export type ContinuityCoreExpectation =
    | 'read_unique_referent'
    | 'read_message_followup'
    | 'read_person_followup'
    | 'open_write'
    | 'confirm_open_plan'
    | 'reject_open_plan'
    | 'correct_open_slot'
    | 'preserve_open_objective'
    | 'change_topic';

export interface ContinuityGateTurn {
    utterance: string;
    semantic: Omit<NormalizedSemanticTurnV4, 'version'>;
    coreExpectation: ContinuityCoreExpectation;
    canonicalId?: string;
    slotName?: string;
    slotValue?: string | null;
}

export interface ContinuityGateCase {
    id: string;
    sourceRun9Family: 'R017' | 'W028' | 'W038' | 'W059' | 'F004' | 'F005' | 'F008' | 'F020' | 'F022' | 'F030';
    turns: ContinuityGateTurn[];
}

function semantic(overrides: Partial<Omit<NormalizedSemanticTurnV4, 'version'>>): Omit<NormalizedSemanticTurnV4, 'version'> {
    return {
        kind: 'unknown',
        domain: 'unknown',
        objectiveCompleteness: 'unknown',
        lifecycleCommand: 'none',
        lifecycleTarget: 'unspecified',
        lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'unknown',
        continuationLike: 'unknown',
        candidateSlotType: null,
        independentObjective: 'unknown',
        objectiveType: null,
        entityHints: [],
        slots: {},
        ambiguityFields: [],
        confidence: 0.95,
        source: 'llm',
        readMeaning: null,
        ...overrides,
    };
}

const readCommitment = (overrides: Partial<Omit<NormalizedSemanticTurnV4, 'version'>> = {}) => semantic({
    kind: 'read_request', domain: 'commitment', objectiveCompleteness: 'complete',
    independentObjective: 'yes', objectiveType: 'lookup', entityHints: ['revisión del generador'],
    readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'commitment', relationship: { kind: 'general_recall' }, temporalRole: 'none', commitmentStatus: 'pending' },
    ...overrides,
});

const writeCommitment = (overrides: Partial<Omit<NormalizedSemanticTurnV4, 'version'>> = {}) => semantic({
    kind: 'write_request', domain: 'commitment', objectiveCompleteness: 'complete',
    independentObjective: 'yes', objectiveType: 'create_personal_commitment', entityHints: ['revisar el estanque'],
    ...overrides,
});

export const M7_SEMANTIC_V4_CONTINUITY_CASES: readonly ContinuityGateCase[] = [
    {
        id: 'CG-R017-01', sourceRun9Family: 'R017', turns: [
            { utterance: '¿A qué hora quedó la revisión del generador?', semantic: readCommitment({ slots: { attribute: 'occurrence_time' } }), coreExpectation: 'read_unique_referent', canonicalId: '00000000-0000-4000-8000-000000000017' },
        ],
    },
    {
        id: 'CG-W028-01', sourceRun9Family: 'W028', turns: [
            { utterance: 'Deja anotado revisar el estanque el jueves a las seis', semantic: writeCommitment(), coreExpectation: 'open_write' },
        ],
    },
    {
        id: 'CG-W038-01', sourceRun9Family: 'W038', turns: [
            { utterance: 'Avísale a Camila que llegaré después y pregúntale si le acomoda', semantic: semantic({ kind: 'write_request', domain: 'messaging', objectiveCompleteness: 'complete', independentObjective: 'yes', objectiveType: 'communicate_message', entityHints: ['Camila'], slots: { response_expected: true } }), coreExpectation: 'open_write' },
        ],
    },
    {
        id: 'CG-W059-01', sourceRun9Family: 'W059', turns: [
            { utterance: 'No acepto la propuesta de vernos durante la tarde', semantic: semantic({ kind: 'lifecycle_command', domain: 'commitment', lifecycleCommand: 'abandon', lifecycleEvidence: 'explicit', objectiveCompleteness: 'complete', independentObjective: 'yes', objectiveType: 'respond_to_existing_proposal' }), coreExpectation: 'reject_open_plan' },
        ],
    },
    {
        id: 'CG-F004-01', sourceRun9Family: 'F004', turns: [
            { utterance: 'Anota una pausa para comprar filtros el miércoles', semantic: writeCommitment({ entityHints: ['comprar filtros'], slots: { date: 'miércoles' } }), coreExpectation: 'open_write' },
            { utterance: 'Sí, déjalo creado', semantic: semantic({ kind: 'lifecycle_command', domain: 'commitment', lifecycleCommand: 'resume', lifecycleEvidence: 'explicit', continuationLike: 'yes', independentObjective: 'no', objectiveType: null }), coreExpectation: 'confirm_open_plan' },
        ],
    },
    {
        id: 'CG-F005-01', sourceRun9Family: 'F005', turns: [
            { utterance: 'Recuérdame enviar el informe el viernes', semantic: writeCommitment({ entityHints: ['enviar el informe'], slots: { date: 'viernes' } }), coreExpectation: 'open_write' },
            { utterance: 'No, mejor déjalo sin hacer', semantic: semantic({ kind: 'lifecycle_command', domain: 'commitment', lifecycleCommand: 'abandon', lifecycleEvidence: 'explicit', continuationLike: 'yes', independentObjective: 'no', objectiveType: null }), coreExpectation: 'reject_open_plan' },
        ],
    },
    {
        id: 'CG-F008-01', sourceRun9Family: 'F008', turns: [
            { utterance: 'Necesito reservar una hora para llamar a Diego', semantic: writeCommitment({ entityHints: ['llamar a Diego'], objectiveCompleteness: 'incomplete' }), coreExpectation: 'preserve_open_objective' },
            { utterance: 'Corrijo: que sea el martes', semantic: semantic({ kind: 'slot_answer', domain: 'commitment', continuationLike: 'yes', independentObjective: 'no', candidateSlotType: 'date', slots: { date: 'martes' } }), coreExpectation: 'correct_open_slot', slotName: 'date', slotValue: 'martes' },
        ],
    },
    {
        id: 'CG-F020-01', sourceRun9Family: 'F020', turns: [
            { utterance: '¿Qué me comentó Paula sobre el envío?', semantic: semantic({ kind: 'read_request', domain: 'messaging', objectiveCompleteness: 'complete', independentObjective: 'yes', objectiveType: 'message_search', entityHints: ['Paula'], readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'message', relationship: { kind: 'message_relationship', relationship: 'content' }, temporalRole: 'none', commitmentStatus: null } }), coreExpectation: 'read_message_followup', canonicalId: '00000000-0000-4000-8000-000000000020' },
            { utterance: '¿Y cuándo ocurrió?', semantic: semantic({ kind: 'read_request', domain: 'messaging', continuationLike: 'yes', independentObjective: 'no', objectiveType: 'message_search', slots: { attribute: 'date' }, readMeaning: { queryShape: 'focused', explicitCollection: false, targetShape: 'message', relationship: { kind: 'message_relationship', relationship: 'conversation_context' }, temporalRole: 'occurrence_time', commitmentStatus: null } }), coreExpectation: 'read_message_followup', canonicalId: '00000000-0000-4000-8000-000000000020' },
        ],
    },
    {
        id: 'CG-F022-01', sourceRun9Family: 'F022', turns: [
            { utterance: 'Quiero dejar listo el cambio de aceite', semantic: writeCommitment({ entityHints: ['cambio de aceite'], objectiveCompleteness: 'incomplete' }), coreExpectation: 'preserve_open_objective' },
            { utterance: 'En la mañana', semantic: semantic({ kind: 'slot_answer', domain: 'commitment', continuationLike: 'yes', independentObjective: 'no', candidateSlotType: 'time', slots: { time: 'mañana' } }), coreExpectation: 'preserve_open_objective', slotName: 'time', slotValue: 'mañana' },
        ],
    },
    {
        id: 'CG-F030-01', sourceRun9Family: 'F030', turns: [
            { utterance: 'Recuérdame revisar el tablero mañana', semantic: writeCommitment({ entityHints: ['revisar el tablero'], slots: { date: 'mañana' } }), coreExpectation: 'open_write' },
            { utterance: 'Ahora quiero saber qué hablé con Andrés', semantic: semantic({ kind: 'read_request', domain: 'messaging', objectiveCompleteness: 'complete', independentObjective: 'yes', objectiveType: 'message_search', entityHints: ['Andrés'], readMeaning: { queryShape: 'collection', explicitCollection: true, targetShape: 'conversation', relationship: { kind: 'person_relationship' }, temporalRole: 'none', commitmentStatus: null } }), coreExpectation: 'change_topic' },
        ],
    },
];
