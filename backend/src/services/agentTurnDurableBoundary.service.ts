import { getEnvConfig } from '../config/env';
import { AppError } from '../utils/AppError';
import type { AgentDialogueState } from '../types/agentDialogueState';
import type { AgentTurnInput, AgentTurnResult } from '../types/agentTurn';
import type { AgentTurnAdmission, AgentTurnProcessingDisposition } from '../types/agentTurnAdmission';
import { buildDialogueScopeKey, createInMemoryDialogueStateRepository, AgentDialogueStateService } from './agentDialogueState.service';
import { runAgentTurn } from './agentTurn.service';
import type { RunAgentTurnOptions } from './agentTurnCore.service';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';
import { createPrivateAgentTurnAdmissionService } from './privateAgentTurnAdmission.service';
import { AgentDialogueCheckpointService, type DialogueCheckpointLoadResult } from './agentDialogueCheckpoint.service';
import { AgentTurnCommitService, toAgentTurnReplayV1, toAgentTurnReplayV2 } from './agentTurnCommit.service';
import { resolveTextSurface } from './agentInputEnvelope.service';
import { verifyVoiceInputToken } from './agentInputEnvelope.service';

const DIALOGUE_STATE_ENVELOPE = 'agent_dialogue_state_v1' as const;

type DurableDialogueEnvelope = {
    kind: typeof DIALOGUE_STATE_ENVELOPE;
    state: AgentDialogueState;
};

export type AgentTurnDurableBoundaryDeps = {
    admission: Pick<AgentTurnAdmissionService, 'admit' | 'claimForProcessing' | 'complete' | 'fail'>;
    checkpoint: Pick<AgentDialogueCheckpointService, 'loadDialogueCheckpoint'>;
    commit: Pick<AgentTurnCommitService, 'applyTurn' | 'reconcileApplication'>;
    runTurn?: typeof runAgentTurn;
};

export function isDurableGeneralAgentTurnEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    return (environment === 'local' || environment === 'staging')
        && process.env.PING_ENABLE_DURABLE_AGENT_TURN === 'true'
        && Boolean(process.env.PING_M7_DATABASE_URL);
}

export function durableDialogueScopeKey(input: AgentTurnInput, now = new Date()): string {
    let surface = resolveTextSurface(input.channel);
    let conversationId = input.conversationId;
    if (input.voiceInputToken) {
        try {
            const envelope = verifyVoiceInputToken(input.voiceInputToken, input.actorUserId, now).envelope;
            surface = envelope.surface;
            // The controller receives only the signed token for voice turns.
            // The token is therefore the authoritative carrier of the
            // conversation scope. Without this assignment the durable
            // boundary admitted/committed under `agent:mobile` while Core
            // persisted dialogue under the real conversationId, making the
            // next confirmation look like an unrelated first turn.
            conversationId = envelope.conversationId ?? undefined;
        } catch {
            // Core performs the authoritative token validation. Keep the
            // historical mobile_voice fallback only for invalid tokens so
            // admission does not leak token details before Core rejects it.
            surface = 'mobile_voice';
        }
    }
    if (input.reviewedVoiceInputToken) {
        try {
            const envelope = verifyVoiceInputToken(input.reviewedVoiceInputToken, input.actorUserId, now).envelope;
            surface = envelope.surface;
            conversationId = envelope.conversationId ?? undefined;
        } catch {
            surface = resolveTextSurface(input.channel);
        }
    }
    return buildDialogueScopeKey({ conversationId, surface });
}

function normalizeIdempotencyKey(value: string): string {
    const normalized = value.trim();
    if (normalized.length < 1 || normalized.length > 200) {
        throw new AppError('Invalid Idempotency-Key', 400);
    }
    return normalized;
}

function semanticRequestFor(input: AgentTurnInput): Record<string, unknown> {
    return {
        version: 1,
        modality: input.voiceInputToken ? 'voice' : input.reviewedVoiceInputToken ? 'reviewed_voice_text' : 'text',
        input: input.input ?? null,
        voiceInputToken: input.voiceInputToken ?? null,
        reviewedVoiceInputToken: input.reviewedVoiceInputToken ?? null,
        conversationId: input.conversationId ?? null,
        channel: input.channel ?? null,
        locale: input.locale ?? null,
        timezone: input.timezone ?? null,
    };
}

function isDialogueState(value: unknown, actorUserId: string, dialogueScopeKey: string): value is AgentDialogueState {
    if (!value || typeof value !== 'object') return false;
    const state = value as Partial<AgentDialogueState>;
    return state.actorUserId === actorUserId
        && state.dialogueScopeKey === dialogueScopeKey
        && typeof state.lifecycle === 'string'
        && typeof state.version === 'number'
        && typeof state.lastTurnSequence === 'number'
        && typeof state.expiresAt === 'string';
}

function decodeDialogueEnvelope(
    value: Record<string, unknown> | null,
    actorUserId: string,
    dialogueScopeKey: string,
): AgentDialogueState | null {
    if (!value || value.kind !== DIALOGUE_STATE_ENVELOPE) return null;
    return isDialogueState(value.state, actorUserId, dialogueScopeKey) ? value.state : null;
}

function hasOccupiedIncompatibleCheckpoint(
    checkpoint: DialogueCheckpointLoadResult,
    actorUserId: string,
    dialogueScopeKey: string,
): boolean {
    if (checkpoint.status !== 'found') return false;
    if (checkpoint.snapshot.activeDialogue) {
        return decodeDialogueEnvelope(checkpoint.snapshot.activeDialogue, actorUserId, dialogueScopeKey) === null;
    }
    return checkpoint.snapshot.lifecycle !== 'idle';
}

function replayToResult(value: Record<string, unknown> | null): AgentTurnResult {
    if (!value || !['response', 'plan', 'clarification', 'unsupported', 'read'].includes(String(value.kind))) {
        throw new AppError('Agent turn replay is invalid', 500);
    }
    return value as unknown as AgentTurnResult;
}

function dispositionError(disposition: AgentTurnProcessingDisposition): never {
    if (disposition.kind === 'in_flight') throw new AppError('Agent turn is already being processed', 409);
    if (disposition.kind === 'terminal_failure') throw new AppError('Agent turn admission is not retryable', 409);
    throw new AppError('Unexpected agent turn processing disposition', 500);
}

async function failBestEffort(
    admission: AgentTurnAdmission,
    service: Pick<AgentTurnAdmissionService, 'fail'>,
): Promise<void> {
    try {
        await service.fail(admission, 'retryable');
    } catch {
        // The original error is more useful to the caller. Reconciliation on
        // the next request remains the recovery path if this RPC is unavailable.
    }
}

function defaultDependencies(): AgentTurnDurableBoundaryDeps {
    return {
        admission: createPrivateAgentTurnAdmissionService(),
        checkpoint: new AgentDialogueCheckpointService(),
        commit: new AgentTurnCommitService(),
    };
}

/**
 * Opt-in durable boundary for the general conversational turn. The existing
 * route remains the default until both the environment flag and client
 * idempotency contract are present.
 */
export async function runDurableAgentTurn(
    input: AgentTurnInput,
    options: RunAgentTurnOptions,
    idempotencyKey: string,
    dependencies: AgentTurnDurableBoundaryDeps = defaultDependencies(),
): Promise<AgentTurnResult> {
    const normalizedIdempotencyKey = normalizeIdempotencyKey(idempotencyKey);
    const dialogueScopeKey = durableDialogueScopeKey(input, options.now);
    const admission = await dependencies.admission.admit({
        actorUserId: input.actorUserId,
        dialogueScopeKey,
        clientTurnKey: normalizedIdempotencyKey,
        semanticRequest: semanticRequestFor(input),
        routingMode: 'legacy',
    });
    const disposition = await dependencies.admission.claimForProcessing(admission);

    if (disposition.kind === 'completed_replay') {
        return replayToResult(disposition.admission.resultRef);
    }
    if (disposition.kind !== 'claimed') dispositionError(disposition);

    const claimedAdmission = disposition.admission;
    let failureRecorded = false;
    let checkpoint: DialogueCheckpointLoadResult;
    try {
        checkpoint = await dependencies.checkpoint.loadDialogueCheckpoint({
            actorUserId: input.actorUserId,
            dialogueScopeKey,
        });
        if (hasOccupiedIncompatibleCheckpoint(checkpoint, input.actorUserId, dialogueScopeKey)) {
            throw new AppError('Dialogue scope is occupied by another durable contract', 409);
        }

        const restoredState = checkpoint.status === 'found'
            ? decodeDialogueEnvelope(checkpoint.snapshot.activeDialogue, input.actorUserId, dialogueScopeKey)
            : null;
        const dialogueService = new AgentDialogueStateService({
            repository: createInMemoryDialogueStateRepository(restoredState ?? undefined),
        });
        const result = await (dependencies.runTurn ?? runAgentTurn)(input, { ...options, dialogueService });
        const nextState = dialogueService.getSnapshot(input.actorUserId, dialogueScopeKey);

        // Read-only turns do not need to create or mutate a dialogue row.
        // This also keeps a pre-existing idle checkpoint untouched.
        if (!nextState) {
            await dependencies.admission.complete(
                claimedAdmission,
                (result.kind === 'read' ? toAgentTurnReplayV2(result) : toAgentTurnReplayV1(result)) as unknown as Record<string, unknown>,
            );
            return result;
        }

        const expectedDialogueVersion = checkpoint.status === 'found' ? checkpoint.snapshot.version : 0;
        try {
            const applied = await dependencies.commit.applyTurn({
                turnId: claimedAdmission.turnId,
                actorUserId: input.actorUserId,
                dialogueScopeKey,
                turnSequence: claimedAdmission.turnSequence,
                expectedDialogueVersion,
                lifecycle: nextState.lifecycle,
                activeDialogue: { kind: DIALOGUE_STATE_ENVELOPE, state: nextState },
                suspendedDialogue: null,
                expiresAt: nextState.expiresAt,
                result,
            });
            return replayToResult(applied.replay as unknown as Record<string, unknown>);
        } catch (error) {
            const reconciliation = await dependencies.commit.reconcileApplication({
                turnId: claimedAdmission.turnId,
                actorUserId: input.actorUserId,
                dialogueScopeKey,
                turnSequence: claimedAdmission.turnSequence,
            });
            if (reconciliation.status === 'committed' && reconciliation.resultRef) {
                return replayToResult(reconciliation.resultRef);
            }
            await failBestEffort(claimedAdmission, dependencies.admission);
            failureRecorded = true;
            throw error;
        }
    } catch (error) {
        if (!failureRecorded) await failBestEffort(claimedAdmission, dependencies.admission);
        throw error;
    }
}
