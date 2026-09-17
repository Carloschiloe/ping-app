import { AppError } from '../utils/AppError';
import { createClient } from '@supabase/supabase-js';
import { getEnvConfig } from '../config/env';
import { AgentTurnRoutingSelectionService, READ_V4_EXACT_COUNT_OPT_IN } from './agentTurnRoutingSelection.service';
import { AgentReadV4DurableOrchestrationService } from './agentReadV4DurableOrchestration.service';
import { createPrivateAgentTurnAdmissionService } from './privateAgentTurnAdmission.service';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';
import { AgentTurnCommitService } from './agentTurnCommit.service';
import { AgentDialogueCheckpointService } from './agentDialogueCheckpoint.service';
import { agentReadV4OrchestrationService } from './agentReadV4Orchestration.service';
import { adaptAgentReadV4Result } from './agentReadResultAdapter.service';
import { canonicalSemanticProducer, type CanonicalSemanticProducerInput } from './canonicalSemanticProducer.service';
import type { NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type { AgentTurnResult } from '../types/agentTurn';

export type AgentTurnReadV4BoundaryInput = {
    actorUserId: string;
    input: string;
    idempotencyKey: string;
    readCapability?: string;
    conversationId?: string;
    locale?: string;
    timezone?: string;
};

function isEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    return (environment === 'local' || environment === 'staging')
        && process.env.PING_ENABLE_READ_V4_EXACT_COUNT === 'true';
}

function bounded(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
        throw new AppError(`Invalid ${name}`, 400);
    }
    return value.trim();
}

function unsupported(reason: string): AgentTurnResult {
    return { kind: 'unsupported', reason, supportedExamples: ['¿Cuántos compromisos tengo pendientes?'] };
}

/**
 * The only /agent/turn V4 entry point in this phase. It accepts no actor or
 * scope from the client and passes the one canonical semantic result into
 * the already durable orchestration as an authoritative checkpoint input.
 */
export async function runExactCommitmentCountV4(input: AgentTurnReadV4BoundaryInput): Promise<AgentTurnResult> {
    if (!isEnabled()) throw new AppError('READ V4 exact count is not enabled', 404);
    if (input.readCapability !== READ_V4_EXACT_COUNT_OPT_IN) throw new AppError('Unsupported READ V4 capability', 400);

    const actorUserId = bounded(input.actorUserId, 'authenticated actor');
    const idempotencyKey = bounded(input.idempotencyKey, 'Idempotency-Key');
    const text = bounded(input.input, 'input');
    const dialogueScopeKey = input.conversationId
        ? `conversation:${input.conversationId}`
        : 'agent:mobile_text';

    const privateAdmission = createPrivateAgentTurnAdmissionService();
    const selection = await new AgentTurnRoutingSelectionService(privateAdmission).selectAndAdmit({
        server: { actorUserId, dialogueScopeKey },
        request: {
            idempotencyKey,
            readCapability: READ_V4_EXACT_COUNT_OPT_IN,
            semanticRequest: { capability: READ_V4_EXACT_COUNT_OPT_IN, input: text, conversationId: input.conversationId ?? null },
        },
    });
    if (selection.routingMode !== 'read_v4_exact_count') return unsupported('read_v4_exact_count_not_selected');

    const producer = {
        produceV4: async (semanticInput: CanonicalSemanticProducerInput): Promise<NormalizedSemanticTurnV4> => {
            const semantic = await canonicalSemanticProducer.produceV4(semanticInput);
            const meaning = semantic.readMeaning;
            if (semantic.kind !== 'read_request' || semantic.domain !== 'commitment' || !meaning
                || meaning.queryShape !== 'count' || meaning.targetShape !== 'none'
                || (meaning.relationship.kind !== 'general_recall' && meaning.relationship.kind !== 'current_state')
                || meaning.commitmentStatus !== 'pending') {
                throw new AppError('READ V4 exact pending count was not semantically established', 422);
            }
            return semantic;
        },
    };
    const runtimeClient = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const runtimeCommit = new AgentTurnCommitService(runtimeClient, runtimeClient);
    const durable = new AgentReadV4DurableOrchestrationService({
        admission: new AgentTurnAdmissionService(runtimeClient),
        semantic: runtimeCommit,
        dialogue: new AgentDialogueCheckpointService(runtimeClient),
        read: agentReadV4OrchestrationService,
        adapt: adaptAgentReadV4Result,
        commit: runtimeCommit,
    }, producer);
    const output = await durable.execute({
        admission: selection.admission,
        semanticInput: {
            text, modality: 'text', locale: input.locale, timezone: input.timezone,
        },
        queryKey: `commitment-count:${selection.admission.turnId}`,
        person: null,
        temporal: { status: 'not_applicable' },
        authorizedScope: { sourceTypes: ['commitment'], ...(input.conversationId ? { conversationId: input.conversationId } : {}) },
    });
    return output.result;
}
