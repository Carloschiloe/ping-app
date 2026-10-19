import { describe, expect, it } from 'vitest';
import {
    buildResult,
    isKnownAgentExecutionStatus,
} from '../src/services/agentExecution.service';
import type { AgentExecutionStepResult } from '../src/types/agentExecution';

function step(overrides: Partial<AgentExecutionStepResult> = {}): AgentExecutionStepResult {
    return {
        stepId: 'step-1',
        toolId: 'send_message',
        status: 'succeeded',
        createdEntityRefs: [],
        updatedEntityRefs: [],
        messageSent: false,
        verified: true,
        idempotentReplay: false,
        ...overrides,
    };
}

describe('agent execution durability contract', () => {
    it('treats an unknown persisted state as unsafe, never as a successful state', () => {
        expect(isKnownAgentExecutionStatus('state_written_by_future_version')).toBe(false);

        const result = buildResult('authorization-1', [
            step({
                status: 'blocked',
                verified: false,
                failureCode: 'execution_state_unknown',
            }),
        ]);

        expect(result.status).toBe('failed');
        expect(result.failedSteps[0]).toMatchObject({
            status: 'blocked',
            failureCode: 'execution_state_unknown',
        });
        expect(result.humanReadableSummary).not.toContain('completado y verificado');
    });

    it('preserves the fail-closed rule for an in-flight step until lease semantics exist', () => {
        expect(isKnownAgentExecutionStatus('running')).toBe(true);

        // A persisted running row is represented to the caller as blocked by
        // executeAuthorization; this test makes the safety boundary explicit:
        // it must not be narrated as success or silently converted into a new
        // attempt by a future refactor without a durable lease/fencing design.
        const result = buildResult('authorization-1', [
            step({ status: 'blocked', verified: false }),
        ]);

        expect(result.status).toBe('failed');
        expect(result.executedSteps).toHaveLength(0);
        expect(result.failedSteps).toHaveLength(1);
    });

    it('keeps failed_retryable distinct from an in-flight/unknown execution', () => {
        const retryable = buildResult('authorization-1', [
            step({ status: 'failed_retryable', failureCode: 'transient_failure', verified: false }),
        ]);
        const inFlight = buildResult('authorization-1', [
            step({ status: 'blocked', failureCode: 'execution_state_unknown', verified: false }),
        ]);

        expect(retryable.status).toBe('failed');
        expect(inFlight.status).toBe('failed');
        expect(retryable.failedSteps[0]?.failureCode).toBe('transient_failure');
        expect(inFlight.failedSteps[0]?.failureCode).toBe('execution_state_unknown');
        expect(retryable.failedSteps[0]?.failureCode).not.toBe(inFlight.failedSteps[0]?.failureCode);
    });
});
