import { afterEach, describe, expect, it } from 'vitest';
import {
    clearAgentDeviceTraceBufferForTests,
    getAgentDeviceDebugMetadata,
    traceAgentDevice,
} from '../src/utils/agentDeviceTrace';

const TRACE_ID = 'trace-device-test';

afterEach(() => {
    clearAgentDeviceTraceBufferForTests();
    delete process.env.PING_ENVIRONMENT;
});

function recordDialogueTrace(): void {
    traceAgentDevice(TRACE_ID, 'AGENT_DIALOGUE_SCOPE', { dialogueScopeKey: 'conversation:test-scope' });
    traceAgentDevice(TRACE_ID, 'AGENT_DIALOGUE_STATE_BEFORE', {
        stateFound: true, lifecycle: 'clarifying', openObjectiveType: 'create_personal_commitment',
        pendingClarificationField: 'person_ambiguous', version: 2, lastTurnSequence: 3,
    });
    traceAgentDevice(TRACE_ID, 'AGENT_PENDING_CLARIFICATION_CHECK', { pendingAnswerable: true });
    traceAgentDevice(TRACE_ID, 'AGENT_PENDING_CLARIFICATION_RESULT', { outcome: 'resolved', candidateCount: 1 });
    traceAgentDevice(TRACE_ID, 'AGENT_ROUTING_DECISION', { path: 'pending_clarification_resolved' });
    traceAgentDevice(TRACE_ID, 'AGENT_CONTEXT_RESULT', { sourceRefCount: 0, resolvedPersonCandidateCount: 1 });
    traceAgentDevice(TRACE_ID, 'AGENT_RESPONSE_KIND', { kind: 'plan' });
}

describe('M-7B device debug envelope', () => {
    it('exposes only bounded safe dialogue/routing metadata in staging', () => {
        process.env.PING_ENVIRONMENT = 'staging';
        recordDialogueTrace();

        expect(getAgentDeviceDebugMetadata(TRACE_ID)).toEqual({
            traceId: TRACE_ID,
            dialogueScopeKey: 'conversation:test-scope',
            stateFound: true,
            dialogueLifecycle: 'clarifying',
            pendingClarificationField: 'person_ambiguous',
            openObjectiveType: 'create_personal_commitment',
            dialogueVersion: 2,
            turnSequence: 3,
            clarificationAttempted: true,
            clarificationOutcome: 'resolved',
            routingDecision: 'pending_clarification_resolved',
            personCandidateCount: 1,
            responseKind: 'plan',
            sourceRefCount: 0,
        });
    });

    it('does not expose debug metadata outside staging', () => {
        process.env.PING_ENVIRONMENT = 'production';
        traceAgentDevice(TRACE_ID, 'AGENT_DIALOGUE_SCOPE', { dialogueScopeKey: 'conversation:test-scope' });
        expect(getAgentDeviceDebugMetadata(TRACE_ID)).toBeUndefined();
    });

    it('contains no raw text, PII, tokens, or records because its schema is metadata-only', () => {
        process.env.PING_ENVIRONMENT = 'staging';
        recordDialogueTrace();
        const debug = getAgentDeviceDebugMetadata(TRACE_ID)!;
        const serialized = JSON.stringify(debug);
        expect(serialized).not.toContain('Pedro');
        expect(serialized).not.toContain('access_token');
        expect(serialized).not.toContain('@');
        expect(serialized).not.toContain('phone');
        expect(Object.keys(debug).sort()).toEqual([
            'clarificationAttempted', 'clarificationOutcome', 'dialogueLifecycle',
            'dialogueScopeKey', 'dialogueVersion', 'openObjectiveType',
            'pendingClarificationField', 'personCandidateCount', 'responseKind',
            'routingDecision', 'sourceRefCount', 'stateFound', 'traceId', 'turnSequence',
        ].sort());
    });
});
