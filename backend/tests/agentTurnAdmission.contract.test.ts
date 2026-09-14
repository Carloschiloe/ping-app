// M-7 PRE-IMPLEMENTATION CONTRACT
//
// This file is intentionally adapter-free. It describes the server-owned
// admission boundary approved for M-7 without changing the current runtime.
import { describe, expect, it } from 'vitest';

type AdmissionStatus = 'accepted' | 'processing' | 'completed' | 'failed';

type AdmissionCase = {
    id: string;
    expectation: string;
};

const admissionCases: AdmissionCase[] = [
    { id: 'first', expectation: 'one server turnId and one atomically assigned sequence' },
    { id: 'retry-same-key-and-fingerprint', expectation: 'same turnId and sequence; no second semantic interpretation' },
    { id: 'same-key-changed-fingerprint', expectation: 'idempotency conflict; no interpretation or mutation' },
    { id: 'concurrent-first-admissions', expectation: 'distinct monotonic sequences without MAX+1 races' },
    { id: 'actor-isolation', expectation: 'same client key cannot cross actors' },
    { id: 'scope-isolation', expectation: 'same client key cannot cross dialogue scopes' },
    { id: 'processing-retry', expectation: 'no duplicate interpretation or dialogue mutation' },
    { id: 'completed-retry', expectation: 'canonical result replay' },
    { id: 'failed-retry', expectation: 'same logical turn and sequence under defined failure policy' },
    { id: 'stale-turn', expectation: 'rejected before dialogue mutation' },
    { id: 'cas-conflict', expectation: 'no partial lifecycle mutation' },
    { id: 'restart-and-multi-instance', expectation: 'identity, dedupe, and order survive process boundaries' },
    { id: 'missing-key-migration', expectation: 'new non-deduplicable turn during migration only' },
    { id: 'no-authorization', expectation: 'admission never authorizes or executes' },
];

const requiredStatuses: AdmissionStatus[] = ['accepted', 'processing', 'completed', 'failed'];

const contractFields = [
    'turnId', 'actorUserId', 'dialogueScopeKey', 'clientTurnKey',
    'requestFingerprint', 'turnSequence', 'status', 'createdAt',
    'updatedAt', 'expiresAt', 'resultRef',
] as const;

const forbiddenConflations = [
    ['turnId', 'traceId'],
    ['turnId', 'planId'],
    ['turnId', 'authorizationId'],
    ['turnId', 'executionId'],
    ['turnSequence', 'clientTurnKey'],
    ['turnSequence', 'traceId'],
    ['turnSequence', 'Date.now'],
] as const;

describe('M-7 turn admission pre-implementation contract', () => {
    it('covers the approved admission and safety cases', () => {
        expect(admissionCases.map(({ id }) => id)).toEqual(expect.arrayContaining([
            'first', 'retry-same-key-and-fingerprint', 'same-key-changed-fingerprint',
            'concurrent-first-admissions', 'actor-isolation', 'scope-isolation',
            'processing-retry', 'completed-retry', 'failed-retry', 'stale-turn',
            'cas-conflict', 'restart-and-multi-instance', 'missing-key-migration',
            'no-authorization',
        ]));
    });

    it('defines a bounded durable record and all lifecycle statuses', () => {
        expect(contractFields).toContain('requestFingerprint');
        expect(contractFields).toContain('resultRef');
        expect(requiredStatuses).toEqual(['accepted', 'processing', 'completed', 'failed']);
    });

    it('requires server ownership and keeps identity domains distinct', () => {
        expect(forbiddenConflations).toHaveLength(7);
        expect(forbiddenConflations).toContainEqual(['turnId', 'traceId']);
        expect(forbiddenConflations).toContainEqual(['turnSequence', 'clientTurnKey']);
        expect(forbiddenConflations).toContainEqual(['turnSequence', 'Date.now']);
    });

    it('requires the database invariants that make admission atomic', () => {
        const uniqueConstraints = [
            '(actorUserId, dialogueScopeKey, clientTurnKey)',
            '(actorUserId, dialogueScopeKey, turnSequence)',
        ];
        expect(uniqueConstraints).toHaveLength(2);
        expect(uniqueConstraints).toContain('(actorUserId, dialogueScopeKey, clientTurnKey)');
        expect(uniqueConstraints).toContain('(actorUserId, dialogueScopeKey, turnSequence)');
    });

    for (const testCase of admissionCases) {
        it.todo(`${testCase.id}: ${testCase.expectation}`);
    }

    it.todo('adapter: one admitted turn invokes semantic interpretation at most once');
    it.todo('adapter: CAS failure leaves dialogue, plan, auth, and execution state unchanged');
    it.todo('adapter: completed retry replays the canonical AgentTurn result');
    it.todo('adapter: duplicate and stale turns cannot mutate another actor or scope');
});

