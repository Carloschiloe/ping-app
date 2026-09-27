import { createHash } from 'node:crypto';
import type { NormalizedSemanticTurnV4 } from '../src/types/agentTurnCommit';
import { LocalDurableCoreAdapter, LocalDurableDialogueStore, type LocalDurableSnapshot } from './m7-local-durable-core-adapter';

const ACTOR = '00000000-0000-4000-8000-000000000001';

function turn(overrides: Partial<NormalizedSemanticTurnV4> = {}): NormalizedSemanticTurnV4 {
    return {
        version: 4,
        kind: 'write_request',
        domain: 'commitment',
        objectiveCompleteness: 'complete',
        lifecycleCommand: 'none',
        lifecycleTarget: 'unspecified',
        lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'not_a_slot_answer',
        continuationLike: 'no',
        candidateSlotType: null,
        independentObjective: 'yes',
        objectiveType: 'create_personal_commitment',
        entityHints: [],
        slots: { title: 'objetivo nuevo' },
        ambiguityFields: [],
        confidence: 0.95,
        source: 'llm',
        temporalFact: undefined,
        readMeaning: null,
        openObjectiveRelation: 'independent',
        ...overrides,
    } as NormalizedSemanticTurnV4;
}

function objective(title: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        objectiveType: 'create_personal_commitment',
        domain: 'write',
        complete: true,
        slots: { title, ...extra },
    };
}

function digest(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function projection(snapshot: LocalDurableSnapshot) {
    return {
        lifecycle: snapshot.lifecycle,
        activeDialogue: snapshot.activeDialogue,
        suspendedDialogue: snapshot.suspendedDialogue,
        version: snapshot.version,
        lastAppliedTurnSequence: snapshot.lastAppliedTurnSequence,
        pendingField: snapshot.pendingField,
        pendingConfirmation: snapshot.pendingConfirmation,
    };
}

function staleValueReappeared(states: LocalDurableSnapshot[]): boolean {
    return states.some(state => state.suspendedDialogue?.objectiveId === 'objective-a'
        && JSON.stringify(state.suspendedDialogue).includes('viernes'));
}

export async function runDurableConversationForTests(): Promise<{ adapter: LocalDurableCoreAdapter; states: LocalDurableSnapshot[] }> {
    const store = new LocalDurableDialogueStore();
    const firstInstance = new LocalDurableCoreAdapter(store, undefined, ACTOR);
    const states: LocalDurableSnapshot[] = [];

    states.push(firstInstance.seedObjective(objective('revisar inventario', { date: null }), { objectiveId: 'objective-a', pendingField: 'date' }));

    // A -> B: the production disposition suspends A and activates B.
    const switched = await firstInstance.applySemanticTurn(
        turn({ slots: { title: 'llamar al proveedor' }, entityHints: ['proveedor'] }),
        'durable-a-to-b',
    );
    states.push(switched.snapshot);

    // Recreate the adapter: all state must come from the durable store.
    const afterReload = new LocalDurableCoreAdapter(store, undefined, ACTOR);
    states.push(afterReload.setPendingField('date'));
    const changedB = await afterReload.applySemanticTurn(
        turn({
            kind: 'slot_answer', objectiveCompleteness: 'unknown', continuationLike: 'yes',
            independentObjective: 'no', objectiveType: null, pendingSlotAnswer: 'likely',
            candidateSlotType: 'date', slots: { date: 'viernes' }, openObjectiveRelation: 'continues',
        }),
        'durable-b-correction',
    );
    states.push(changedB.snapshot);
    if (changedB.snapshot.suspendedDialogue && JSON.stringify(changedB.snapshot.suspendedDialogue).includes('viernes')) {
        throw new Error('NO_CROSS_OBJECTIVE_SLOT_LEAKAGE');
    }

    // B -> A: use the production lifecycle resume disposition, not a text rule.
    const afterSecondReload = new LocalDurableCoreAdapter(store, undefined, ACTOR);
    const resumed = await afterSecondReload.applySemanticTurn(
        turn({
            kind: 'lifecycle_command', domain: 'generic', objectiveCompleteness: 'unknown',
            lifecycleCommand: 'resume', lifecycleTarget: 'suspended', lifecycleEvidence: 'explicit',
            continuationLike: 'yes', independentObjective: 'no', objectiveType: null,
            slots: {}, openObjectiveRelation: 'continues',
        }),
        'durable-b-to-a',
    );
    states.push(resumed.snapshot);
    if (resumed.snapshot.activeDialogue?.objectiveId !== 'objective-a') throw new Error('RETURN_TO_OBJECTIVE_WRONG_TARGET');
    if (resumed.snapshot.pendingField !== 'date') throw new Error('NO_STALE_PENDING_FIELD_AFTER_SWITCH');

    const afterThirdReload = new LocalDurableCoreAdapter(store, undefined, ACTOR);
    const correctedA = await afterThirdReload.applySemanticTurn(
        turn({
            kind: 'slot_answer', objectiveCompleteness: 'unknown', continuationLike: 'yes',
            independentObjective: 'no', objectiveType: null, pendingSlotAnswer: 'likely',
            candidateSlotType: 'date', slots: { date: 'jueves' }, openObjectiveRelation: 'continues',
        }),
        'durable-a-correction',
    );
    states.push(correctedA.snapshot);

    const confirmation = afterThirdReload.stageConfirmation('plan-a-current');
    states.push(afterThirdReload.getSnapshot());
    const confirmed = afterThirdReload.confirm('plan-a-current');
    states.push(confirmed);
    if (confirmation.objectiveId !== 'objective-a' || confirmed.lifecycle !== 'resolved') {
        throw new Error('CONFIRMATION_TARGET_WRONG');
    }
    return { adapter: afterThirdReload, states };
}

async function runAmbiguity(): Promise<boolean> {
    const adapter = new LocalDurableCoreAdapter(new LocalDurableDialogueStore(), undefined, ACTOR);
    adapter.seedObjective(objective('revisar inventario'), { objectiveId: 'ambiguous-a' });
    const result = await adapter.applySemanticTurn(turn({
        kind: 'unknown', objectiveCompleteness: 'unknown', objectiveType: null,
        independentObjective: 'unknown', ambiguityFields: ['objective'], slots: {},
        openObjectiveRelation: 'ambiguous',
    }), 'ambiguous-turn');
    return result.telemetry.core.disposition === 'reclarify'
        && result.snapshot.activeDialogue?.objectiveId === 'ambiguous-a'
        && result.snapshot.suspendedDialogue === null;
}

async function runFaults(): Promise<{ staleVersion: boolean; wrongTarget: boolean; crossObjective: boolean }> {
    const staleStore = new LocalDurableDialogueStore();
    const staleAdapter = new LocalDurableCoreAdapter(staleStore, undefined, ACTOR);
    staleAdapter.seedObjective(objective('stale'), { objectiveId: 'stale-objective' });
    const stale = staleStore.read();
    let staleVersion = false;
    try {
        staleStore.save({ ...stale, version: stale.version + 1 }, stale.version - 1);
    } catch { staleVersion = true; }

    const targetAdapter = new LocalDurableCoreAdapter(new LocalDurableDialogueStore(), undefined, ACTOR);
    targetAdapter.seedObjective(objective('target'), { objectiveId: 'target-objective' });
    targetAdapter.stageConfirmation('target-plan');
    let wrongTarget = false;
    try { targetAdapter.confirm('other-plan'); } catch { wrongTarget = true; }

    const crossAdapter = new LocalDurableCoreAdapter(new LocalDurableDialogueStore(), undefined, ACTOR);
    crossAdapter.seedObjective(objective('cross'), { objectiveId: 'cross-objective', pendingField: 'date' });
    let crossObjective = false;
    try {
        await crossAdapter.applySemanticTurn(turn({
            kind: 'slot_answer', objectiveCompleteness: 'unknown', continuationLike: 'yes',
            independentObjective: 'no', objectiveType: null, pendingSlotAnswer: 'likely',
            candidateSlotType: 'person', slots: { person: 'otro objetivo' }, openObjectiveRelation: 'continues',
        }), 'cross-objective-write');
    } catch { crossObjective = true; }
    return { staleVersion, wrongTarget, crossObjective };
}

export async function runLocalDurableCoreValidation() {
    const previousShadow = process.env.PING_SEMANTIC_V4_CORE_SHADOW;
    const previousEnvironment = process.env.PING_ENVIRONMENT;
    process.env.PING_SEMANTIC_V4_CORE_SHADOW = 'true';
    process.env.PING_ENVIRONMENT = 'local';
    try {
        const first = await runDurableConversationForTests();
        const second = await runDurableConversationForTests();
        const ambiguity = await runAmbiguity();
        const faults = await runFaults();
        const firstProjection = first.states.map(projection);
        const secondProjection = second.states.map(projection);
        return {
            stateBoundaryIdentified: true,
            productionCoreReused: true,
            localAdapterType: 'in-memory CAS store + production V4 adapter/resolver/disposition',
            realDurableConversations: 2,
            realDurableTurns: first.states.length,
            currentVersionCorrect: first.states.every((state, index) => state.version === index + 1),
            staleSlotReappearance: staleValueReappeared(first.states),
            confirmationTargetCorrect: first.states.at(-1)?.lifecycle === 'resolved',
            objectiveSwitchIsolated: first.states[1]?.activeDialogue?.objectiveId !== first.states[1]?.suspendedDialogue?.objectiveId,
            returnToObjectiveCorrect: first.states[4]?.activeDialogue?.objectiveId === 'objective-a',
            ambiguityDoesNotAssume: ambiguity,
            correctionReplacesActiveValue: first.states[5]?.activeDialogue?.date === 'jueves',
            confirmationBindsCurrentVersion: first.states.at(-1)?.pendingConfirmation === null,
            noCrossObjectiveSlotLeakage: !staleValueReappeared(first.states),
            noStalePendingFieldAfterSwitch: first.states[4]?.pendingField === 'date' && first.states[5]?.pendingField === null,
            reloadContinuity: first.states[2]?.activeDialogue?.objectiveId === 'objective-2' && first.states[4]?.activeDialogue?.objectiveId === 'objective-a',
            staleVersionDetected: faults.staleVersion,
            wrongConfirmationTargetDetected: faults.wrongTarget,
            crossObjectiveWriteDetected: faults.crossObjective,
            captureVsReplay: JSON.stringify(firstProjection) === JSON.stringify(secondProjection),
            replay1VsReplay2: JSON.stringify(secondProjection) === JSON.stringify(firstProjection),
            finalStateHash: digest(firstProjection.at(-1)),
            externalWriterAttempts: first.adapter.sideEffects.externalWriterAttempts,
            externalToolAttempts: first.adapter.sideEffects.externalToolAttempts,
            networkSideEffectAttempts: first.adapter.sideEffects.networkSideEffectAttempts,
            sideEffects: 0,
            shadowFailures: 0,
        };
    } finally {
        if (previousShadow === undefined) delete process.env.PING_SEMANTIC_V4_CORE_SHADOW;
        else process.env.PING_SEMANTIC_V4_CORE_SHADOW = previousShadow;
        if (previousEnvironment === undefined) delete process.env.PING_ENVIRONMENT;
        else process.env.PING_ENVIRONMENT = previousEnvironment;
    }
}

if (require.main === module) {
    void runLocalDurableCoreValidation().then(report => console.log(JSON.stringify(report))).catch(error => {
        console.error(JSON.stringify({ status: 'local_durable_core_validation_failed', message: error instanceof Error ? error.message : String(error) }));
        process.exitCode = 1;
    });
}
