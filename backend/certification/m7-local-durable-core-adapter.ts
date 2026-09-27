import { adaptSemanticV4ToCore, runSemanticV4CoreShadow, type V4CoreShadowTelemetry } from '../src/services/agentSemanticV4CoreShadow.service';
import {
    AgentSemanticV4HighFidelityReadOnlyResolver,
    createHighFidelityReadOnlyRepositoryForTest,
    type HighFidelityReadOnlyRepository,
} from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { agentTurnDispositionService } from '../src/services/agentTurnDisposition.service';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import type { AgentSemanticInterpretation } from '../src/services/agentSemanticInterpreter.service';
import type { DispositionDialogueSnapshot } from '../src/types/agentTurnDisposition';

export type LocalPendingConfirmation = {
    objectiveId: string;
    version: number;
    planDigest: string;
};

export type LocalDurableSnapshot = DispositionDialogueSnapshot & {
    pendingField: string | null;
    pendingConfirmation: LocalPendingConfirmation | null;
};

export type LocalMutation = {
    objectiveId: string | null;
    versionBefore: number;
    versionAfter: number;
    activeObjectiveId: string | null;
    pendingField: string | null;
    pendingConfirmation: LocalPendingConfirmation | null;
};

export type LocalSideEffectCounters = {
    externalWriterAttempts: number;
    externalToolAttempts: number;
    networkSideEffectAttempts: number;
};

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
}

function activeId(snapshot: LocalDurableSnapshot): string | null {
    const value = snapshot.activeDialogue?.objectiveId;
    return typeof value === 'string' ? value : null;
}

export class LocalDurableDialogueStore {
    private snapshot: LocalDurableSnapshot;
    private readonly mutations: LocalMutation[] = [];

    public constructor(initial?: Partial<LocalDurableSnapshot>) {
        this.snapshot = {
            lifecycle: 'idle',
            activeDialogue: null,
            suspendedDialogue: null,
            version: 0,
            lastAppliedTurnId: null,
            lastAppliedTurnSequence: 0,
            pendingField: null,
            pendingConfirmation: null,
            ...clone(initial ?? {}),
        };
    }

    public read(): LocalDurableSnapshot {
        return clone(this.snapshot);
    }

    public save(next: LocalDurableSnapshot, expectedVersion: number): LocalDurableSnapshot {
        if (this.snapshot.version !== expectedVersion) {
            throw new Error(`LOCAL_DURABLE_STALE_VERSION expected=${expectedVersion} actual=${this.snapshot.version}`);
        }
        if (next.version !== expectedVersion + 1) {
            throw new Error(`LOCAL_DURABLE_INVALID_VERSION expected=${expectedVersion + 1} actual=${next.version}`);
        }
        this.snapshot = clone(next);
        this.mutations.push({
            objectiveId: activeId(next),
            versionBefore: expectedVersion,
            versionAfter: next.version,
            activeObjectiveId: activeId(next),
            pendingField: next.pendingField,
            pendingConfirmation: clone(next.pendingConfirmation),
        });
        return this.read();
    }

    public mutationsSnapshot(): LocalMutation[] {
        return clone(this.mutations);
    }
}

function legacyProjection(semantic: NormalizedSemanticTurnV4): AgentSemanticInterpretation {
    return {
        route: semantic.kind === 'read_request' ? 'read' : 'write',
        interpretation: { isWriteActionRequest: semantic.kind !== 'read_request', schemaValid: true } as AgentSemanticInterpretation['interpretation'],
        objective: semantic.kind === 'read_request' || !semantic.objectiveType ? null : {
            objectiveType: semantic.objectiveType,
            targetEntities: { personHints: [], entityHints: semantic.entityHints },
            constraints: { decisionHint: null, draftOnly: false, responsibleHint: null },
            desiredOutcome: String(semantic.slots.title ?? semantic.slots.action ?? semantic.objectiveType),
            timeConstraints: { rawHint: null },
            actor: 'local-certification-actor',
            sourceUtterance: '',
            confidence: semantic.confidence,
            ambiguities: [],
            source: 'llm',
            communicateContentCandidate: null,
            modelUsed: 'local-semantic-v4-replay',
        },
    } as AgentSemanticInterpretation;
}

function diagnostics(): any {
    return {
        schemaValid: true, failure: null, providerRequestSucceeded: true,
        providerFailure: false, providerErrorClass: null, providerHttpStatus: null,
        providerErrorCode: null, providerErrorMessage: null, finishReason: 'stop',
        refusalPresent: false, contentPresent: true, contentLength: 1,
        normalizationSuccess: true, fallbackReason: null, model: 'local-semantic-v4-replay',
        latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
    };
}

function objectiveId(snapshot: LocalDurableSnapshot, prefix: string): string {
    return `${prefix}-${snapshot.version + 1}`;
}

function withObjectiveId(objective: Record<string, unknown>, id: string, pendingField: string | null = null): Record<string, unknown> {
    return { ...clone(objective), objectiveId: id, pendingField };
}

export class LocalDurableCoreAdapter {
    public readonly sideEffects: LocalSideEffectCounters = {
        externalWriterAttempts: 0,
        externalToolAttempts: 0,
        networkSideEffectAttempts: 0,
    };
    private readonly resolver: AgentSemanticV4HighFidelityReadOnlyResolver;

    public constructor(
        private readonly store: LocalDurableDialogueStore,
        repository: HighFidelityReadOnlyRepository = createHighFidelityReadOnlyRepositoryForTest(),
        private readonly actorUserId = '00000000-0000-4000-8000-000000000001',
        private readonly dialogueScopeKey = 'local-durable-m7',
    ) {
        this.resolver = new AgentSemanticV4HighFidelityReadOnlyResolver(repository);
    }

    public getSnapshot(): LocalDurableSnapshot {
        return this.store.read();
    }

    public seedObjective(objective: Record<string, unknown>, input: { objectiveId: string; pendingField?: string | null } ): LocalDurableSnapshot {
        const before = this.store.read();
        const next: LocalDurableSnapshot = {
            ...before,
            lifecycle: 'collecting',
            activeDialogue: withObjectiveId(objective, input.objectiveId, input.pendingField ?? null),
            suspendedDialogue: null,
            pendingField: input.pendingField ?? null,
            pendingConfirmation: null,
            version: before.version + 1,
            lastAppliedTurnId: `seed-${input.objectiveId}`,
            lastAppliedTurnSequence: before.lastAppliedTurnSequence + 1,
        };
        return this.store.save(next, before.version);
    }

    /** Test boundary for a planner-produced missing slot; it stores no language policy. */
    public setPendingField(field: string | null): LocalDurableSnapshot {
        const before = this.store.read();
        if (!before.activeDialogue) throw new Error('LOCAL_DURABLE_NO_ACTIVE_OBJECTIVE');
        const next: LocalDurableSnapshot = {
            ...before,
            activeDialogue: { ...before.activeDialogue, pendingField: field },
            pendingField: field,
            version: before.version + 1,
            lastAppliedTurnId: 'set-pending-field',
            lastAppliedTurnSequence: before.lastAppliedTurnSequence + 1,
        };
        return this.store.save(next, before.version);
    }

    public async applySemanticTurn(semantic: NormalizedSemanticTurnV4, turnId: string): Promise<{ telemetry: V4CoreShadowTelemetry; snapshot: LocalDurableSnapshot }> {
        const before = this.store.read();
        if (semantic.kind === 'slot_answer'
            && before.pendingField
            && semantic.candidateSlotType !== before.pendingField) {
            throw new Error(`LOCAL_DURABLE_CROSS_OBJECTIVE_SLOT_WRITE expected=${before.pendingField} actual=${semantic.candidateSlotType ?? 'none'}`);
        }
        if (semantic.kind === 'slot_answer' && !before.pendingField) {
            throw new Error('LOCAL_DURABLE_SLOT_WRITE_WITHOUT_PENDING_FIELD');
        }
        const adapted = adaptSemanticV4ToCore(semantic);
        const resolution = await this.resolver.resolve({
            actorUserId: this.actorUserId,
            dialogueScopeKey: this.dialogueScopeKey,
            semanticV4: adapted.semanticV4,
            semanticV2: adapted.semanticV2,
            dialogue: before,
            timezone: 'America/Santiago',
            turnReferenceInstant: '2026-09-27T15:00:00.000Z',
        });
        const telemetry = await runSemanticV4CoreShadow({
            legacy: legacyProjection(semantic),
            request: { text: 'local semantic replay', modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: null },
            dialogue: before,
            actorUserId: this.actorUserId,
            dialogueScopeKey: this.dialogueScopeKey,
            semanticResult: { semantic: adapted.semanticV4, diagnostics: diagnostics() },
            resolver: this.resolver,
        });
        if (!telemetry.enabled || telemetry.failure || telemetry.core.disposition === null) {
            throw new Error(`LOCAL_DURABLE_SHADOW_FAILURE=${telemetry.failure ?? 'disposition_not_reached'}`);
        }

        const decision = agentTurnDispositionService.decide({
            semanticTurn: adapted.dispositionSemantic,
            dialogue: before,
            pendingSlotResolution: resolution.pendingSlotResolution,
            suspendedResumeCandidate: resolution.suspendedResumeCandidate,
        });
        if (decision.disposition !== telemetry.core.disposition) {
            throw new Error(`LOCAL_DURABLE_DISPOSITION_MISMATCH=${decision.disposition}/${telemetry.core.disposition}`);
        }

        let activeDialogue = decision.transition.activeDialogue;
        let suspendedDialogue = decision.transition.suspendedDialogue;
        let pendingField = before.pendingField;
        if (decision.transition.kind === 'update_active' && resolution.pendingSlotResolution?.status === 'resolved') {
            pendingField = pendingField === resolution.pendingSlotResolution.slot ? null : pendingField;
            if (activeDialogue) activeDialogue = { ...activeDialogue, pendingField };
        }
        if (decision.disposition === 'new_objective' && activeDialogue && !activeDialogue.objectiveId) {
            activeDialogue = withObjectiveId(activeDialogue, objectiveId(before, 'objective'));
        }
        if (decision.transition.kind === 'resume_suspended' && activeDialogue) {
            pendingField = typeof activeDialogue.pendingField === 'string' ? activeDialogue.pendingField : null;
        }
        if (decision.disposition === 'reclarify') {
            activeDialogue = before.activeDialogue;
            suspendedDialogue = before.suspendedDialogue;
        }
        const next: LocalDurableSnapshot = {
            ...before,
            lifecycle: activeDialogue || suspendedDialogue ? 'collecting' : 'idle',
            activeDialogue,
            suspendedDialogue,
            pendingField,
            pendingConfirmation: decision.transition.kind === 'update_active' || decision.disposition === 'new_objective'
                ? null : before.pendingConfirmation,
            version: before.version + 1,
            lastAppliedTurnId: turnId,
            lastAppliedTurnSequence: before.lastAppliedTurnSequence + 1,
        };
        return { telemetry, snapshot: this.store.save(next, before.version) };
    }

    public stageConfirmation(planDigest: string): LocalPendingConfirmation {
        const before = this.store.read();
        const id = activeId(before);
        if (!id || !before.activeDialogue) throw new Error('LOCAL_DURABLE_NO_ACTIVE_OBJECTIVE');
        const nextVersion = before.version + 1;
        const pending: LocalPendingConfirmation = { objectiveId: id, version: nextVersion, planDigest };
        const next = { ...before, pendingConfirmation: pending, lifecycle: 'plan_pending_authorization' as const, version: nextVersion, lastAppliedTurnId: 'stage-confirmation', lastAppliedTurnSequence: before.lastAppliedTurnSequence + 1 };
        this.store.save(next, before.version);
        return clone(pending);
    }

    public confirm(planDigest: string): LocalDurableSnapshot {
        const before = this.store.read();
        const pending = before.pendingConfirmation;
        const id = activeId(before);
        if (!pending || pending.planDigest !== planDigest || pending.objectiveId !== id || pending.version !== before.version) {
            throw new Error('LOCAL_DURABLE_CONFIRMATION_TARGET_MISMATCH');
        }
        const next: LocalDurableSnapshot = {
            ...before,
            lifecycle: 'resolved',
            pendingConfirmation: null,
            version: before.version + 1,
            lastAppliedTurnId: 'confirm',
            lastAppliedTurnSequence: before.lastAppliedTurnSequence + 1,
        };
        return this.store.save(next, before.version);
    }

    public tryConfirmWithStaleVersion(planDigest: string, staleVersion: number): boolean {
        const before = this.store.read();
        const pending = before.pendingConfirmation;
        return Boolean(pending && pending.planDigest === planDigest && pending.version === staleVersion && pending.version === before.version);
    }
}

export function createLocalDurableCoreAdapter(initial?: Partial<LocalDurableSnapshot>): LocalDurableCoreAdapter {
    return new LocalDurableCoreAdapter(new LocalDurableDialogueStore(initial));
}
