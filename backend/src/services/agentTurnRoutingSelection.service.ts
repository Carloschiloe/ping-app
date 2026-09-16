import { getEnvConfig } from '../config/env';
import { AgentTurnAdmissionService } from './agentTurnAdmission.service';
import { createPrivateAgentTurnAdmissionService } from './privateAgentTurnAdmission.service';
import type { AgentTurnAdmission, AgentTurnRoutingMode } from '../types/agentTurnAdmission';
import { AppError } from '../utils/AppError';

export const READ_V4_EXACT_COUNT_OPT_IN = 'commitment_count_v4';

export interface ServerTurnContext {
    /** Populated from authenticated server context, never from the client payload. */
    actorUserId: string;
    /** Derived and authorized by the server, never accepted from a client header/body. */
    dialogueScopeKey: string;
}

export interface AgentTurnRoutingSelectionRequest {
    server: ServerTurnContext;
    request: {
        /** HTTP Idempotency-Key; stable across retries and never a trace/request id. */
        idempotencyKey: string;
        readCapability?: string;
        semanticRequest: Record<string, unknown>;
    };
}

export interface AgentTurnRoutingConfig {
    environmentName: string;
    readV4ExactCountEnabled: boolean;
}

export interface AgentTurnRoutingSelection {
    admission: AgentTurnAdmission;
    /** Effective mode. Historical NULL admissions are treated as legacy. */
    routingMode: AgentTurnRoutingMode;
    newlySelected: boolean;
}

function defaultConfig(): AgentTurnRoutingConfig {
    return {
        environmentName: getEnvConfig().environmentName,
        readV4ExactCountEnabled: process.env.PING_ENABLE_READ_V4_EXACT_COUNT === 'true',
    };
}

function requireBoundedString(value: unknown, name: string): string {
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > 200) {
        throw new AppError(`Invalid ${name}`, 400);
    }
    return value;
}

function requestedMode(config: AgentTurnRoutingConfig, readCapability: string | undefined): AgentTurnRoutingMode {
    return config.environmentName === 'staging'
        && config.readV4ExactCountEnabled
        && readCapability === READ_V4_EXACT_COUNT_OPT_IN
        ? 'read_v4_exact_count'
        : 'legacy';
}

/**
 * Selects a server-owned routing mode and admits the turn in one durable boundary.
 * The admission RPC performs the existing-key lookup before inserting; consequently
 * its stored routing mode remains authoritative when configuration changes on retry.
 */
export class AgentTurnRoutingSelectionService {
    public constructor(
        private readonly admissionService: Pick<AgentTurnAdmissionService, 'admit'> = createPrivateAgentTurnAdmissionService(),
        private readonly configProvider: () => AgentTurnRoutingConfig = defaultConfig,
    ) {}

    public async selectAndAdmit(input: AgentTurnRoutingSelectionRequest): Promise<AgentTurnRoutingSelection> {
        const actorUserId = requireBoundedString(input.server.actorUserId, 'authenticated actor');
        const dialogueScopeKey = requireBoundedString(input.server.dialogueScopeKey, 'dialogue scope key');
        const clientTurnKey = requireBoundedString(input.request.idempotencyKey, 'idempotency key');
        const candidateMode = requestedMode(this.configProvider(), input.request.readCapability);

        // Always use the routing-mode RPC, including for legacy candidates. This lets
        // the database recover historical/new admissions and return their stored mode.
        const admission = await this.admissionService.admit({
            actorUserId,
            dialogueScopeKey,
            clientTurnKey,
            semanticRequest: input.request.semanticRequest,
            routingMode: candidateMode,
        });

        return {
            admission,
            routingMode: admission.routingMode ?? 'legacy',
            newlySelected: !admission.idempotentReplay,
        };
    }
}
