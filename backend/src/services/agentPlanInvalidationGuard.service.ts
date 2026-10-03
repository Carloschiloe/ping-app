import { agentDialogueCheckpointService } from './agentDialogueCheckpoint.service';

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
