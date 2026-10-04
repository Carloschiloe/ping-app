import { agentDialogueCheckpointService } from './agentDialogueCheckpoint.service';
import type { AgentObjective } from '../types/agentPlan';

// Process-local defense for the default in-memory dialogue boundary. Staging
// also persists the same tombstones in the durable checkpoint, but the
// authorization boundary must remain safe when a caller is using the
// process-local repository (tests and legacy deployments).
const processInvalidatedDigests = new Set<string>();

function processDigestKey(actorUserId: string, dialogueScopeKey: string, digest: string): string {
    return `${actorUserId}::${dialogueScopeKey}::${digest}`;
}

export function recordPlanDigestNonExecutable(input: {
    actorUserId: string;
    dialogueScopeKey: string;
    planDigest: string;
}): void {
    processInvalidatedDigests.add(processDigestKey(input.actorUserId, input.dialogueScopeKey, input.planDigest));
}

export function clearPlanDigestInvalidationsForTests(): void {
    processInvalidatedDigests.clear();
}

function resolveSurface(channel?: string): 'mobile_text' | 'web' | 'desktop' | 'tablet' | 'car' | 'device' {
    return channel === 'web' ? 'web'
        : channel === 'desktop' ? 'desktop'
            : channel === 'tablet' ? 'tablet'
                : channel === 'car' ? 'car'
                    : channel === 'device' ? 'device'
                        : 'mobile_text';
}

function buildScope(conversationId: string | null | undefined, surface: ReturnType<typeof resolveSurface>): string {
    if (conversationId) return conversationId;
    return `agent:${surface === 'mobile_text' ? 'mobile' : surface}`;
}

export async function isPlanDigestNonExecutable(input: {
    actorUserId: string;
    conversationId?: string;
    channel?: string;
    inputEnvelope?: { conversationId?: string | null; surface: string };
    planDigest: string;
}): Promise<boolean> {
    const dialogueScopeKey = buildScope(
        input.inputEnvelope?.conversationId ?? input.conversationId,
        resolveSurface(input.inputEnvelope?.surface ?? input.channel),
    );
    if (processInvalidatedDigests.has(processDigestKey(input.actorUserId, dialogueScopeKey, input.planDigest))) return true;
    if (process.env.PING_ENABLE_DURABLE_AGENT_TURN !== 'true' || !process.env.PING_M7_DATABASE_URL) return false;
    const checkpoint = await agentDialogueCheckpointService.loadDialogueCheckpoint({
        actorUserId: input.actorUserId,
        dialogueScopeKey,
    });
    if (checkpoint.status !== 'found') return false;
    const active = checkpoint.snapshot.activeDialogue as { state?: { nonExecutablePlanDigestRefs?: Array<{ digest: string }> } } | null;
    return Boolean(active?.state?.nonExecutablePlanDigestRefs?.some((ref) => ref.digest === input.planDigest));
}

/**
 * Returns the Core-owned objective for the currently pending digest. This is
 * deliberately kept beside the invalidation guard because both operations
 * must read the same durable dialogue checkpoint and apply the same scope /
 * identity boundary. Authorization uses this only when the claimed digest is
 * the active pending digest; otherwise it falls back to ordinary re-planning.
 */
export async function loadPendingDialogueObjective(input: {
    actorUserId: string;
    conversationId?: string;
    channel?: string;
    inputEnvelope?: { conversationId?: string | null; surface: string };
    planDigest: string;
}): Promise<AgentObjective | null> {
    if (process.env.PING_ENABLE_DURABLE_AGENT_TURN !== 'true' || !process.env.PING_M7_DATABASE_URL) return null;
    const dialogueScopeKey = buildScope(
        input.inputEnvelope?.conversationId ?? input.conversationId,
        resolveSurface(input.inputEnvelope?.surface ?? input.channel),
    );
    const checkpoint = await agentDialogueCheckpointService.loadDialogueCheckpoint({
        actorUserId: input.actorUserId,
        dialogueScopeKey,
    });
    if (checkpoint.status !== 'found') return null;
    const active = checkpoint.snapshot.activeDialogue as {
        kind?: string;
        state?: {
            actorUserId?: string;
            dialogueScopeKey?: string;
            lifecycle?: string;
            currentPlanDigestRef?: string | null;
            openObjective?: AgentObjective | null;
        };
    } | null;
    const state = active?.kind === 'agent_dialogue_state_v1' ? active.state : null;
    if (
        state?.actorUserId !== input.actorUserId
        || state.dialogueScopeKey !== dialogueScopeKey
        || state.lifecycle !== 'plan_pending_authorization'
        || state.currentPlanDigestRef !== input.planDigest
        || !state.openObjective
    ) return null;
    return state.openObjective;
}
