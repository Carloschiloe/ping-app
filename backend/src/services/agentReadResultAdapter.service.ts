import { assertReadExecutionResult, type ReadExecutionResult } from '../types/agentReadExecution';
import type { AgentTurnRead } from '../types/agentTurn';
import type { CanonicalReadQuery } from '../types/agentReadQuery';
import { canonicalAgentTurnFingerprint } from './agentTurnAdmission.service';

export type AgentReadV4ResultAdapterInput = {
    actorUserId: string;
    query: CanonicalReadQuery;
    result: ReadExecutionResult;
};

function scopeFingerprintInput(input: AgentReadV4ResultAdapterInput): Record<string, unknown> {
    return {
        actorUserId: input.actorUserId,
        authorizedScope: input.query.authorizedScope,
    };
}

function constraintsFingerprintInput(input: AgentReadV4ResultAdapterInput): Record<string, unknown> {
    return {
        domain: input.query.domain,
        cardinality: input.query.cardinality,
        target: input.query.target,
        relationship: input.query.relationship,
        temporal: input.query.temporal,
        evidenceRequirement: input.query.evidenceRequirement,
    };
}

/**
 * Projects an already executed V4 READ into the durable turn contract.
 * It never interprets text, retrieves data, or creates public copy.
 */
export function adaptAgentReadV4Result(input: AgentReadV4ResultAdapterInput): AgentTurnRead {
    const execution = assertReadExecutionResult(input.result);
    if (typeof input.result.queryKey !== 'string' || input.result.queryKey.length === 0) {
        throw new Error('READ result queryKey is invalid');
    }
    return {
        kind: 'read',
        execution,
        scopeFingerprint: canonicalAgentTurnFingerprint(scopeFingerprintInput(input)),
        constraintsFingerprint: canonicalAgentTurnFingerprint(constraintsFingerprintInput(input)),
    };
}
