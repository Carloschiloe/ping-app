import { getEnvConfig } from '../config/env';
import type { AgentSemanticInterpretation } from './agentSemanticInterpreter.service';
import type { CanonicalSemanticProducer, SemanticDialogueContext, SemanticV4Diagnostics } from './canonicalSemanticProducer.service';
import type { NormalizedSemanticTurnV2, NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type {
    AgentTurnDispositionDecision,
    AgentTurnDispositionInput,
    DispositionDialogueSnapshot,
    NormalizedDispositionSemanticTurn,
    PendingSlotResolution,
} from '../types/agentTurnDisposition';
import { normalizeSemanticTurnV4 } from './agentTurnSemanticV4.service';
import { mapSemanticTurnV2ToDisposition, normalizeSemanticTurnV2 } from './agentTurnSemanticV2.service';
import { agentTurnDispositionService, type AgentTurnDispositionService } from './agentTurnDisposition.service';
import { canonicalSemanticProducer } from './canonicalSemanticProducer.service';
import { agentSemanticV4HighFidelityReadOnlyResolver } from './agentSemanticV4HighFidelityReadOnly.service';

export type V4CoreShadowDifferenceClass =
    | 'SEMANTIC_DISAGREEMENT'
    | 'ENTITY_RESOLUTION_DISAGREEMENT'
    | 'REFERENCE_RESOLUTION_DISAGREEMENT'
    | 'DISPOSITION_DISAGREEMENT'
    | 'AUTHORIZATION_RELEVANT_DISAGREEMENT'
    | 'CORE_RESOLUTION_DISAGREEMENT'
    | 'PLAN_SHAPE_DISAGREEMENT'
    | 'LEGACY_ONLY'
    | 'V4_ONLY'
    | 'SHADOW_ERROR';

export interface V4CoreShadowDifference {
    class: V4CoreShadowDifferenceClass;
    dimension: 'route' | 'objective' | 'disposition' | 'target' | 'slots' | 'lifecycle' | 'plan';
    legacy: string | null;
    v4: string | null;
}

export interface V4CoreShadowResolutionSummary {
    status: 'not_attempted' | 'not_applicable' | 'zero_match' | 'ambiguous' | 'resolved' | 'result_set';
    referenceKind: 'none' | 'person' | 'commitment' | 'proposal' | 'message' | 'result_set';
    candidateCount: number | null;
    scopeKind: 'none' | 'scoped' | 'empty_scope';
}

export interface V4CoreShadowResolution {
    summary: V4CoreShadowResolutionSummary;
    pendingSlotResolution?: PendingSlotResolution;
    suspendedResumeCandidate?: AgentTurnDispositionInput['suspendedResumeCandidate'];
    /** Internal-only canonical evidence. Never serialized into telemetry. */
    details?: { canonicalId: string; targetKind: string };
}

/**
 * The resolver seam is deliberately structured-only. A production cutover
 * may inject the canonical resolver later; this shadow default never queries
 * storage and therefore cannot accidentally authorize an entity.
 */
export interface V4CoreShadowResolver {
    resolve(input: {
        actorUserId?: string;
        dialogueScopeKey?: string;
        semanticV4: NormalizedSemanticTurnV4;
        semanticV2: NormalizedSemanticTurnV2;
        dialogue: DispositionDialogueSnapshot | null;
        timezone?: string;
        turnReferenceInstant?: string;
        authorizedScope?: import('../types/agentReadQuery').CanonicalReadScope;
        priorReferent?: { kind: 'commitment' | 'proposal' | 'message' | 'person'; id: string } | null;
    }): Promise<V4CoreShadowResolution>;
}

export interface V4CoreShadowContextSummary {
    needsClarification: boolean;
    sourceRefCount: number;
    intentType: string | null;
}

export interface V4CoreShadowInput {
    legacy: AgentSemanticInterpretation;
    request: {
        text: string;
        modality: 'text' | 'voice';
        locale?: string;
        timezone?: string;
        dialogue?: SemanticDialogueContext | null;
    };
    dialogue: DispositionDialogueSnapshot | null;
    actorUserId?: string;
    dialogueScopeKey?: string;
    turnReferenceInstant?: string;
    authorizedScope?: import('../types/agentReadQuery').CanonicalReadScope;
    priorReferent?: { kind: 'commitment' | 'proposal' | 'message' | 'person'; id: string } | null;
    context?: V4CoreShadowContextSummary;
    producer?: Pick<CanonicalSemanticProducer, 'produceV4WithDiagnostics'> & { modelName?: string };
    /** Reuses the V4 result already produced by the adjacent semantic shadow. */
    semanticResult?: { semantic: NormalizedSemanticTurnV4; diagnostics: SemanticV4Diagnostics };
    resolver?: V4CoreShadowResolver;
    disposition?: Pick<AgentTurnDispositionService, 'decide'>;
    timeoutMs?: number;
}

export interface V4CoreShadowPlanShape {
    route: 'read' | 'write' | 'none';
    disposition: AgentTurnDispositionDecision['disposition'] | null;
    objectiveType: string | null;
    relevantSlotNames: string[];
    lifecycleCommand: string | null;
    requiresAuthorization: false;
    requiresExecution: false;
}

export interface V4CoreShadowTelemetry {
    enabled: boolean;
    mode: 'V4_CORE_SHADOW';
    model: string | null;
    providerFailure: boolean;
    timeout: boolean;
    schemaValid: boolean | null;
    fallbackReason: string | null;
    failure: string | null;
    latencyMs: number | null;
    v4: {
        kind: string | null;
        domain: string | null;
        objectiveType: string | null;
        confidence: number | null;
        ambiguityCount: number | null;
        continuationLike: string | null;
        independentObjective: string | null;
        openObjectiveRelation: string | null;
        pendingSlotAnswer: string | null;
        lifecycleCommand: string | null;
        slotNames: string[];
        readMeaning: string | null;
        temporalFact: string | null;
    };
    core: {
        mappedKind: NormalizedDispositionSemanticTurn['kind'] | null;
        disposition: AgentTurnDispositionDecision['disposition'] | null;
        dispositionReason: string | null;
        resolution: V4CoreShadowResolutionSummary;
        planShape: V4CoreShadowPlanShape | null;
    };
    differences: V4CoreShadowDifference[];
    sideEffects: {
        toolsExecuted: false;
        persistenceWrites: 0;
        dialogueStateMutated: false;
        legacyResultChanged: false;
    };
}

const DEFAULT_TIMEOUT_MS = 3000;

const noResolution: V4CoreShadowResolver = {
    resolve: async () => ({
        summary: { status: 'not_attempted', referenceKind: 'none', candidateCount: null, scopeKind: 'none' },
    }),
};

export function isSemanticV4CoreShadowEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    return process.env.PING_SEMANTIC_V4_CORE_SHADOW === 'true'
        && (environment === 'local' || environment === 'staging')
        && process.env.NODE_ENV !== 'production';
}

function emptyResolution(): V4CoreShadowResolutionSummary {
    return { status: 'not_attempted', referenceKind: 'none', candidateCount: null, scopeKind: 'none' };
}

function emptyTelemetry(): V4CoreShadowTelemetry {
    return {
        enabled: false, mode: 'V4_CORE_SHADOW', model: null, providerFailure: false,
        timeout: false, schemaValid: null, fallbackReason: null, failure: null,
        latencyMs: null,
        v4: {
            kind: null, domain: null, objectiveType: null, confidence: null,
            ambiguityCount: null, continuationLike: null, independentObjective: null,
            openObjectiveRelation: null,
            pendingSlotAnswer: null, lifecycleCommand: null, slotNames: [],
            readMeaning: null, temporalFact: null,
        },
        core: {
            mappedKind: null, disposition: null, dispositionReason: null,
            resolution: emptyResolution(), planShape: null,
        },
        differences: [],
        sideEffects: {
            toolsExecuted: false, persistenceWrites: 0,
            dialogueStateMutated: false, legacyResultChanged: false,
        },
    };
}

function routeOf(turn: NormalizedSemanticTurnV4): 'read' | 'write' | null {
    if (turn.kind === 'read_request') return 'read';
    if (turn.kind === 'write_request' || turn.kind === 'lifecycle_command' || turn.kind === 'slot_answer') return 'write';
    return null;
}

function serializeReadMeaning(turn: NormalizedSemanticTurnV4): string | null {
    if (!turn.readMeaning) return null;
    return `${turn.readMeaning.queryShape}:${turn.readMeaning.targetShape}:${turn.readMeaning.temporalRole}`;
}

function serializeTemporalFact(turn: NormalizedSemanticTurnV4): string | null {
    const fact = turn.temporalFact;
    if (!fact) return null;
    return fact.kind;
}

function buildPlanShape(
    turn: NormalizedSemanticTurnV4,
    mapped: NormalizedDispositionSemanticTurn,
    decision: AgentTurnDispositionDecision,
): V4CoreShadowPlanShape {
    const route = routeOf(turn) ?? 'none';
    return {
        route,
        disposition: decision.disposition,
        objectiveType: turn.objectiveType,
        relevantSlotNames: Object.keys(turn.slots).sort(),
        lifecycleCommand: mapped.lifecycleCommand,
        requiresAuthorization: false,
        requiresExecution: false,
    };
}

function compareStructural(
    legacy: AgentSemanticInterpretation,
    turn: NormalizedSemanticTurnV4,
    decision: AgentTurnDispositionDecision,
    resolution: V4CoreShadowResolutionSummary,
): V4CoreShadowDifference[] {
    const differences: V4CoreShadowDifference[] = [];
    const v4Route = routeOf(turn);
    if (v4Route !== legacy.route) {
        differences.push({ class: v4Route ? 'SEMANTIC_DISAGREEMENT' : 'V4_ONLY', dimension: 'route', legacy: legacy.route, v4: v4Route });
    }
    const legacyObjective = legacy.objective?.objectiveType ?? null;
    const v4Objective = turn.objectiveType;
    if (legacyObjective !== v4Objective) {
        differences.push({ class: v4Objective ? 'SEMANTIC_DISAGREEMENT' : 'LEGACY_ONLY', dimension: 'objective', legacy: legacyObjective, v4: v4Objective });
    }
    if (decision.disposition === 'reclarify' && turn.ambiguityFields.length === 0 && turn.objectiveCompleteness === 'complete') {
        differences.push({ class: 'CORE_RESOLUTION_DISAGREEMENT', dimension: 'disposition', legacy: legacy.route, v4: decision.reason });
    }
    if (resolution.status === 'ambiguous') {
        differences.push({ class: 'ENTITY_RESOLUTION_DISAGREEMENT', dimension: 'target', legacy: null, v4: 'ambiguous' });
        // Preserve the original telemetry class for existing consumers while
        // exposing the more precise V4 classification above.
        differences.push({ class: 'CORE_RESOLUTION_DISAGREEMENT', dimension: 'target', legacy: null, v4: 'ambiguous' });
    }
    return differences;
}

function toCoreSemantic(turn: NormalizedSemanticTurnV4): NormalizedSemanticTurnV2 {
    return normalizeSemanticTurnV2({
        version: 2,
        kind: turn.kind,
        domain: turn.domain,
        objectiveCompleteness: turn.objectiveCompleteness,
        lifecycleCommand: turn.lifecycleCommand,
        lifecycleTarget: turn.lifecycleTarget,
        lifecycleEvidence: turn.lifecycleEvidence,
        pendingSlotAnswer: turn.pendingSlotAnswer,
        continuationLike: turn.continuationLike,
        candidateSlotType: turn.candidateSlotType,
        independentObjective: turn.independentObjective,
        objectiveType: turn.objectiveType,
        entityHints: turn.entityHints,
        slots: turn.slots,
        ambiguityFields: turn.ambiguityFields,
        confidence: turn.confidence,
        source: turn.source,
    });
}

/**
 * V4 -> Core is an adapter, not another interpreter. V4-specific meaning is
 * retained beside the provider-neutral V2 projection; no identity or trust
 * is created by this function.
 */
export function adaptSemanticV4ToCore(input: NormalizedSemanticTurnV4): {
    semanticV4: NormalizedSemanticTurnV4;
    semanticV2: NormalizedSemanticTurnV2;
    dispositionSemantic: NormalizedDispositionSemanticTurn;
} {
    const semanticV4 = normalizeSemanticTurnV4(input);
    const semanticV2 = toCoreSemantic(semanticV4);
    return {
        semanticV4,
        semanticV2,
        dispositionSemantic: {
            ...mapSemanticTurnV2ToDisposition(semanticV2),
            openObjectiveRelation: semanticV4.openObjectiveRelation,
        },
    };
}

function shadowErrorTelemetry(input: V4CoreShadowInput, started: number, failure: string, timeout: boolean, providerFailure: boolean): V4CoreShadowTelemetry {
    return {
        ...emptyTelemetry(), enabled: true, model: input.producer?.modelName ?? null,
        providerFailure, timeout, failure, schemaValid: false,
        latencyMs: Date.now() - started,
        differences: [{ class: 'SHADOW_ERROR', dimension: 'plan', legacy: input.legacy.route, v4: null }],
    };
}

/**
 * Executes the semantic boundary, Core disposition and a side-effect-free
 * plan shape. It intentionally has no writer, persistence, tool or dialogue
 * repository dependency. Any failure is telemetry only; legacy owns output.
 */
export async function runSemanticV4CoreShadow(input: V4CoreShadowInput): Promise<V4CoreShadowTelemetry> {
    if (!isSemanticV4CoreShadowEnabled()) return emptyTelemetry();
    const started = Date.now();
    const producer = input.producer ?? canonicalSemanticProducer;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const result = input.semanticResult ?? await Promise.race([
            producer.produceV4WithDiagnostics(input.request),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('semantic_v4_core_shadow_timeout')), input.timeoutMs ?? DEFAULT_TIMEOUT_MS); }),
        ]);
        const normalized = adaptSemanticV4ToCore(result.semantic);
        const diagnostics = result.diagnostics;
        const base: V4CoreShadowTelemetry = {
            ...emptyTelemetry(), enabled: true, model: producer.modelName ?? null,
            providerFailure: diagnostics.providerFailure, timeout: false,
            schemaValid: diagnostics.schemaValid, fallbackReason: diagnostics.fallbackReason,
            failure: diagnostics.failure, latencyMs: Date.now() - started,
            v4: {
                kind: normalized.semanticV4.kind, domain: normalized.semanticV4.domain,
                objectiveType: normalized.semanticV4.objectiveType, confidence: normalized.semanticV4.confidence,
                ambiguityCount: normalized.semanticV4.ambiguityFields.length,
                continuationLike: normalized.semanticV4.continuationLike,
                independentObjective: normalized.semanticV4.independentObjective,
                openObjectiveRelation: normalized.semanticV4.openObjectiveRelation ?? null,
                pendingSlotAnswer: normalized.semanticV4.pendingSlotAnswer,
                lifecycleCommand: normalized.semanticV4.lifecycleCommand,
                slotNames: Object.keys(normalized.semanticV4.slots).sort(),
                readMeaning: serializeReadMeaning(normalized.semanticV4),
                temporalFact: serializeTemporalFact(normalized.semanticV4),
            },
            core: {
                mappedKind: normalized.dispositionSemantic.kind,
                disposition: null, dispositionReason: null,
                resolution: emptyResolution(), planShape: null,
            },
            differences: [],
            sideEffects: {
                toolsExecuted: false, persistenceWrites: 0,
                dialogueStateMutated: false, legacyResultChanged: false,
            },
        };
        // Provider degradation is recorded but is never promoted to a Core
        // decision. This keeps fallback/provider errors separate from semantic
        // evidence and protects the legacy path.
        if (diagnostics.providerFailure || diagnostics.fallbackReason) {
            return {
                ...base,
                differences: [{ class: 'SHADOW_ERROR', dimension: 'route', legacy: input.legacy.route, v4: normalized.semanticV4.kind }],
            };
        }
        const resolver = input.resolver ?? (input.actorUserId ? agentSemanticV4HighFidelityReadOnlyResolver : noResolution);
        const resolution = await resolver.resolve({
            actorUserId: input.actorUserId,
            dialogueScopeKey: input.dialogueScopeKey,
            semanticV4: normalized.semanticV4,
            semanticV2: normalized.semanticV2,
            dialogue: input.dialogue ? JSON.parse(JSON.stringify(input.dialogue)) : null,
            timezone: input.request.timezone,
            turnReferenceInstant: input.turnReferenceInstant,
            authorizedScope: input.authorizedScope,
            priorReferent: input.priorReferent,
        });
        const decision = (input.disposition ?? agentTurnDispositionService).decide({
            semanticTurn: normalized.dispositionSemantic,
            dialogue: input.dialogue ? JSON.parse(JSON.stringify(input.dialogue)) : null,
            pendingSlotResolution: resolution.pendingSlotResolution,
            suspendedResumeCandidate: resolution.suspendedResumeCandidate,
        });
        const planShape = buildPlanShape(normalized.semanticV4, normalized.dispositionSemantic, decision);
        return {
            ...base,
            core: {
                mappedKind: normalized.dispositionSemantic.kind,
                disposition: decision.disposition,
                dispositionReason: decision.reason,
                resolution: resolution.summary,
                planShape,
            },
            differences: compareStructural(input.legacy, normalized.semanticV4, decision, resolution.summary),
        };
    } catch (error) {
        const timeout = error instanceof Error && error.message === 'semantic_v4_core_shadow_timeout';
        return shadowErrorTelemetry(input, started, timeout ? 'timeout' : 'shadow_failure', timeout, !timeout);
    } finally {
        if (timer) clearTimeout(timer);
    }
}
