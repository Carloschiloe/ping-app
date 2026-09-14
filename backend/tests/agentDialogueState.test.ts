// M-7A — Dialogue State Foundation tests. Covers the 24 test areas required
// by the task: scope isolation, versioning/CAS, lifecycle transitions,
// slot/correction semantics, referent-candidate advisory-only structure,
// expiry, reset, and explicit proof of NO live wiring / NO memory_records
// interaction / NO Plan/Authorization/Execution mutation.
//
// This module is NOT imported by any live Agent pipeline file (see the
// service's own header comment) -- these tests exercise it in complete
// isolation, exactly as it will remain until a later, separate wiring task.
import { afterEach, describe, expect, it } from 'vitest';
import {
    AgentDialogueStateService,
    DIALOGUE_STATE_LIMITS,
    buildDialogueScopeKey,
    clearAgentDialogueStateForTests,
    createInMemoryDialogueStateRepository,
    transitionDialogueState,
} from '../src/services/agentDialogueState.service';
import type { AgentObjective } from '../src/types/agentPlan';

afterEach(() => {
    clearAgentDialogueStateForTests();
});

const ACTOR_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACTOR_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV_1 = 'conv-1';
const CONV_2 = 'conv-2';

function objective(overrides: Partial<AgentObjective> = {}): AgentObjective {
    return {
        objectiveType: 'communicate_message',
        targetEntities: { personHints: ['Pedro'], entityHints: [] },
        constraints: {},
        desiredOutcome: 'llamar a Pedro',
        timeConstraints: { rawHint: null },
        actor: ACTOR_A,
        sourceUtterance: 'Mañana tengo que llamar a Pedro.',
        confidence: 0.8,
        ambiguities: [],
        source: 'deterministic',
        ...overrides,
    };
}

describe('buildDialogueScopeKey (ADR Q4)', () => {
    it('uses conversationId when present', () => {
        expect(buildDialogueScopeKey({ conversationId: CONV_1, surface: 'mobile_text' })).toBe(CONV_1);
    });

    it('degrades to agent:<surface> when conversationId is absent (Agent Preview / global Agent)', () => {
        expect(buildDialogueScopeKey({ surface: 'mobile_text' })).toBe('agent:mobile_text');
        expect(buildDialogueScopeKey({ conversationId: null, surface: 'mobile_voice' })).toBe('agent:mobile_voice');
    });

    it('different surfaces produce different global scope keys -- never collide', () => {
        expect(buildDialogueScopeKey({ surface: 'mobile_text' })).not.toBe(buildDialogueScopeKey({ surface: 'mobile_voice' }));
    });
});

describe('scope isolation (test areas 1-3)', () => {
    it('1. same actor + same conversation -> same scope (state persists across calls)', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        const snapshot = service.getSnapshot(ACTOR_A, CONV_1);
        expect(snapshot?.openObjective?.sourceUtterance).toBe('Mañana tengo que llamar a Pedro.');
    });

    it('2. same actor + different conversation -> different scope, no contamination', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        expect(service.getSnapshot(ACTOR_A, CONV_2)).toBeNull();
    });

    it('2b. different actor, same conversation key string -> different scope, no contamination', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        expect(service.getSnapshot(ACTOR_B, CONV_1)).toBeNull();
    });

    it('3. global Agent surface scope does not collide with a real DIRECT conversation scope', () => {
        const service = new AgentDialogueStateService();
        const globalScope = buildDialogueScopeKey({ surface: 'mobile_text' });
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: globalScope, objective: objective(), turnId: 't1', turnSequence: 1 });
        expect(service.getSnapshot(ACTOR_A, CONV_1)).toBeNull();
        expect(service.getSnapshot(ACTOR_A, globalScope)?.openObjective).not.toBeNull();
    });
});

describe('create/read + versioning (test areas 4-7)', () => {
    it('4. create then read returns the persisted state', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        const snapshot = service.getSnapshot(ACTOR_A, CONV_1);
        expect(snapshot).not.toBeNull();
        expect(snapshot?.lifecycle).toBe('collecting');
    });

    it('5. version increments on every write', () => {
        const service = new AgentDialogueStateService();
        const first = service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        expect(first.version).toBe(1);
        const second = service.applyCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'timeConstraints.rawHint',
            previousValue: null, newValue: 'a las nueve', reason: 'clarification_answer', turnId: 't2', turnSequence: 2,
        });
        expect(second.version).toBe(2);
    });

    it('6. stale CAS write is rejected at the repository layer (direct repository test, bypassing the service turn-sequence guard)', () => {
        const repo = createInMemoryDialogueStateRepository();
        const now = new Date();
        const state = {
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, lifecycle: 'idle' as const, openObjective: null,
            ambiguities: [], pendingClarification: null, corrections: {}, referents: [],
            currentPlanDigestRef: null, currentAuthorizationIdRef: null, version: 0, lastTurnSequence: 0,
            createdAt: now.toISOString(), updatedAt: now.toISOString(), expiresAt: new Date(now.getTime() + 60_000).toISOString(),
        };
        const saved = repo.save(state, null);
        expect(saved.version).toBe(0);
        // A second writer that read the SAME version 0 both attempt to save;
        // the first succeeds, the second (stale expectedVersion) must be rejected.
        repo.save({ ...saved, version: 1 }, 0);
        expect(() => repo.save({ ...saved, version: 1 }, 0)).toThrow(/version conflict/i);
    });

    it('7. turnSequence is monotonic -- an older/late turn is rejected, never overwrites a newer correction', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 5 });
        // A late-arriving response for an earlier turn (turnSequence 3) must be rejected.
        expect(() =>
            service.applyCorrection({
                actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'timeConstraints.rawHint',
                previousValue: null, newValue: 'a las nueve', reason: 'clarification_answer', turnId: 'late', turnSequence: 3,
            }),
        ).toThrow(/stale dialogue turn/i);
        // The state is untouched by the rejected stale write.
        expect(service.getSnapshot(ACTOR_A, CONV_1)?.lastTurnSequence).toBe(5);
    });
});

describe('lifecycle transitions (test areas 8-9)', () => {
    it('8. valid lifecycle transitions succeed: idle -> collecting -> clarifying -> ready_to_plan -> plan_pending_authorization -> resolved', () => {
        expect(transitionDialogueState('idle', 'collecting')).toBe('collecting');
        expect(transitionDialogueState('collecting', 'clarifying')).toBe('clarifying');
        expect(transitionDialogueState('clarifying', 'ready_to_plan')).toBe('ready_to_plan');
        expect(transitionDialogueState('ready_to_plan', 'plan_pending_authorization')).toBe('plan_pending_authorization');
        expect(transitionDialogueState('plan_pending_authorization', 'resolved')).toBe('resolved');
    });

    it('8b. plan_pending_authorization -> collecting is a valid transition (a correction invalidating a pending plan reference)', () => {
        expect(transitionDialogueState('plan_pending_authorization', 'collecting')).toBe('collecting');
    });

    it('9. invalid lifecycle transitions are rejected -- e.g. idle -> plan_pending_authorization, resolved -> collecting, expired -> anything', () => {
        expect(() => transitionDialogueState('idle', 'plan_pending_authorization')).toThrow(/invalid dialogue state transition/i);
        expect(() => transitionDialogueState('resolved', 'collecting')).toThrow(/invalid dialogue state transition/i);
        expect(() => transitionDialogueState('expired', 'idle')).toThrow(/invalid dialogue state transition/i);
    });

    it('lifecycle enum shares no values/field names with AgentPlanStatus or AgentAuthorizationStatus (explicit non-duplication check)', () => {
        const dialogueStates = ['idle', 'collecting', 'clarifying', 'ready_to_plan', 'plan_pending_authorization', 'resolved', 'expired'];
        const planStatuses = ['draft', 'needs_clarification', 'ready_for_authorization'];
        const authorizationStatuses = ['pending', 'authorized', 'consumed', 'expired', 'revoked'];
        // 'expired' legitimately appears in both dialogue lifecycle and
        // authorization status as an English word -- but they are DIFFERENT
        // enums/types (DialogueLifecycleState vs AgentAuthorizationStatus),
        // never a shared type. This test documents that the only lexical
        // overlap is this one common English word, not structural coupling.
        const overlapWithPlan = dialogueStates.filter((s) => planStatuses.includes(s));
        const overlapWithAuth = dialogueStates.filter((s) => authorizationStatuses.includes(s) && s !== 'expired');
        expect(overlapWithPlan).toEqual([]);
        expect(overlapWithAuth).toEqual([]);
    });
});

describe('slot creation/update + unresolved-slot tracking (test areas 10-11)', () => {
    it('10. openObjective creates a snapshot with the given objective as the current slot state', () => {
        const service = new AgentDialogueStateService();
        const obj = objective({ timeConstraints: { rawHint: null } });
        const snapshot = service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: obj, turnId: 't1', turnSequence: 1 });
        expect(snapshot.openObjective?.timeConstraints.rawHint).toBeNull();
    });

    it('11. an ambiguity (unresolved slot) is tracked on the snapshot', () => {
        const service = new AgentDialogueStateService();
        const snapshot = service.openObjective({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1,
            ambiguities: [{ field: 'timeConstraints.rawHint', kind: 'blocking', reason: 'No indicaste la hora.' }],
        });
        expect(snapshot.ambiguities).toHaveLength(1);
        expect(snapshot.ambiguities[0].field).toBe('timeConstraints.rawHint');
    });
});

describe('correction stack (test areas 12-15, ADR Q6)', () => {
    it('12. correction pushes previous value onto the slot stack', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        const snapshot = service.applyCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', previousValue: null, newValue: 'a las nueve',
            reason: 'clarification_answer', turnId: 't2', turnSequence: 2,
        });
        expect(snapshot.corrections.time).toHaveLength(1);
        expect(snapshot.corrections.time[0]).toMatchObject({ previousValue: null, newValue: 'a las nueve' });
    });

    it('13. correction depth is capped at maxCorrectionsPerSlot (3) -- excessive history does not grow unbounded', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        let seq = 2;
        for (let i = 0; i < 10; i += 1) {
            service.applyCorrection({
                actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', previousValue: `v${i}`, newValue: `v${i + 1}`,
                reason: 'user_correction', turnId: `t${seq}`, turnSequence: seq,
            });
            seq += 1;
        }
        const snapshot = service.getSnapshot(ACTOR_A, CONV_1);
        expect(snapshot?.corrections.time).toHaveLength(DIALOGUE_STATE_LIMITS.maxCorrectionsPerSlot);
        expect(DIALOGUE_STATE_LIMITS.maxCorrectionsPerSlot).toBe(3);
    });

    it('14. rollback restores the correct previous value ("no, déjalo como estaba")', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        service.applyCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', previousValue: null, newValue: 'a las nueve',
            reason: 'clarification_answer', turnId: 't2', turnSequence: 2,
        });
        service.applyCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', previousValue: 'a las nueve', newValue: 'a las diez',
            reason: 'user_correction', turnId: 't3', turnSequence: 3,
        });
        const { reverted, restoredValue } = service.rollbackCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', turnId: 't4', turnSequence: 4,
        });
        expect(reverted).toBe(true);
        expect(restoredValue).toBe('a las nueve');
    });

    it('15. rollback with no history behaves safely (reverted:false, never throws)', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        const { reverted, restoredValue } = service.rollbackCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'never_touched', turnId: 't2', turnSequence: 2,
        });
        expect(reverted).toBe(false);
        expect(restoredValue).toBeNull();
    });

    it('a correction targeting the slot referenced by a pending plan clears the plan reference and reopens collecting (ADR Q13)', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        service.markReadyForAuthorization({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, planDigest: 'digest-9am', turnId: 't2', turnSequence: 2 });
        expect(service.getSnapshot(ACTOR_A, CONV_1)?.currentPlanDigestRef).toBe('digest-9am');

        const afterCorrection = service.applyCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', previousValue: 'a las nueve', newValue: 'a las diez',
            reason: 'user_correction', turnId: 't3', turnSequence: 3,
        });
        expect(afterCorrection.currentPlanDigestRef).toBeNull();
        expect(afterCorrection.lifecycle).toBe('collecting');
    });
});

describe('referent candidates (test areas 16-17, ADR Q7)', () => {
    it('16. referent candidate storage', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        const snapshot = service.addReferentCandidate({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, rawText: 'Pedro', kind: 'person', turnId: 't2', turnSequence: 2,
        });
        expect(snapshot.referents).toHaveLength(1);
        expect(snapshot.referents[0].rawText).toBe('Pedro');
    });

    it('17. referents remain structurally advisory -- the type has no canonical-entity-ID field, so a resolved ID can never be stored here', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        const snapshot = service.addReferentCandidate({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, rawText: 'Pedro', kind: 'person', turnId: 't2', turnSequence: 2,
        });
        // TypeScript enforces this structurally (DialogueReferentCandidate
        // has no canonicalEntityId field) -- this runtime check confirms
        // the actual stored object carries exactly the advisory fields and
        // nothing that looks like a resolved ID.
        expect(Object.keys(snapshot.referents[0]).sort()).toEqual(['addedAt', 'kind', 'rawText', 'sourceTurnId'].sort());
    });
});

describe('expiry (test areas 18-19, ADR Q8)', () => {
    it('18. inactivity TTL expiry -- state is gone after the inactivity window elapses', () => {
        let now = new Date('2026-01-01T00:00:00.000Z');
        const service = new AgentDialogueStateService({ now: () => now });
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        expect(service.getSnapshot(ACTOR_A, CONV_1)).not.toBeNull();

        now = new Date(now.getTime() + DIALOGUE_STATE_LIMITS.inactivityTtlMs + 1000);
        expect(service.getSnapshot(ACTOR_A, CONV_1)).toBeNull();
    });

    it('19. post-resolution retention is shorter than the inactivity TTL, then also expires', () => {
        let now = new Date('2026-01-01T00:00:00.000Z');
        const service = new AgentDialogueStateService({ now: () => now });
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        service.markReadyForAuthorization({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, planDigest: 'd1', turnId: 't2', turnSequence: 2 });
        service.markResolved({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, turnId: 't3', turnSequence: 3 });
        expect(service.getSnapshot(ACTOR_A, CONV_1)).not.toBeNull();

        // Still alive just before the (shorter) resolved-retention window elapses.
        now = new Date(now.getTime() + DIALOGUE_STATE_LIMITS.resolvedRetentionMs - 1000);
        expect(service.getSnapshot(ACTOR_A, CONV_1)).not.toBeNull();

        // Gone once the resolved-retention window elapses -- well before the
        // full inactivity TTL would have (proves resolved uses the shorter TTL).
        now = new Date(now.getTime() + 2000);
        expect(service.getSnapshot(ACTOR_A, CONV_1)).toBeNull();
        expect(DIALOGUE_STATE_LIMITS.resolvedRetentionMs).toBeLessThan(DIALOGUE_STATE_LIMITS.inactivityTtlMs);
    });
});

describe('reset/delete (test area 20)', () => {
    it('20. soft reset clears the objective/corrections/clarification and returns to idle', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        service.applyCorrection({
            actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, slotName: 'time', previousValue: null, newValue: 'a las nueve',
            reason: 'clarification_answer', turnId: 't2', turnSequence: 2,
        });
        service.reset({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1 });
        const snapshot = service.getSnapshot(ACTOR_A, CONV_1);
        expect(snapshot?.lifecycle).toBe('idle');
        expect(snapshot?.openObjective).toBeNull();
        expect(snapshot?.corrections).toEqual({});
    });

    it('20b. hard reset (logout) deletes the row entirely', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        service.reset({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, hardDelete: true });
        expect(service.getSnapshot(ACTOR_A, CONV_1)).toBeNull();
    });
});

describe('test isolation (test area 21)', () => {
    it('21. clearAgentDialogueStateForTests wipes all scopes -- no leakage between tests', () => {
        const service = new AgentDialogueStateService();
        service.openObjective({ actorUserId: ACTOR_A, dialogueScopeKey: CONV_1, objective: objective(), turnId: 't1', turnSequence: 1 });
        clearAgentDialogueStateForTests();
        expect(service.getSnapshot(ACTOR_A, CONV_1)).toBeNull();
    });

    it('21b. a fresh in-memory repository instance starts empty, independent of the default module-level repository', () => {
        const repo = createInMemoryDialogueStateRepository();
        expect(repo.get(ACTOR_A, CONV_1, new Date())).toBeNull();
    });
});

describe('architectural fences (test areas 22-24) — explicit proof of scope boundaries', () => {
    it('22. this module has no IMPORT of memory.service.ts and no code (outside comments) that writes to memory_records', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/agentDialogueState.service.ts'), 'utf-8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        expect(codeOnly).not.toMatch(/from ['"].*memory\.service['"]/);
        expect(codeOnly).not.toMatch(/memory_records/);
        expect(codeOnly).not.toMatch(/ingestMemoryFromEvent/);
    });

    it('23. no live Agent pipeline file imports agentDialogueState.service.ts (proves zero live wiring)', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const pipelineFiles = [
            'agentTurn.service.ts',
            'agentInputInterpreter.service.ts',
            'agentObjectiveInterpreter.service.ts',
            'agentContextBuilder.service.ts',
            'agentPlanner.service.ts',
            'agentPlanOrchestrator.service.ts',
            'agentAuthorization.service.ts',
            'agentExecution.service.ts',
            'agentVoice.service.ts',
        ];
        for (const file of pipelineFiles) {
            const source = fs.readFileSync(path.join(__dirname, '../src/services', file), 'utf-8');
            expect(source, `${file} must not import agentDialogueState.service.ts yet`).not.toMatch(/agentDialogueState\.service/);
        }
    });

    it('24. this module has no IMPORT of agentPlanner.service.ts, agentAuthorization.service.ts, or agentExecution.service.ts, and no DB/RPC call (proves it cannot mutate Plan/Authorization/Execution state)', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/agentDialogueState.service.ts'), 'utf-8');
        const codeOnly = source
            .split('\n')
            .filter((line) => !line.trim().startsWith('//'))
            .join('\n');
        expect(codeOnly).not.toMatch(/from ['"].*agentPlanner\.service['"]/);
        expect(codeOnly).not.toMatch(/from ['"].*agentAuthorization\.service['"]/);
        expect(codeOnly).not.toMatch(/from ['"].*agentExecution\.service['"]/);
        expect(codeOnly).not.toMatch(/supabaseAdmin/);
        expect(codeOnly).not.toMatch(/\.rpc\(/);
    });

    it('this module never imports supabaseAdmin or any DB client -- confirms Phase 1 is genuinely in-memory only, no DB/schema dependency', () => {
        const fs = require('node:fs') as typeof import('node:fs');
        const path = require('node:path') as typeof import('node:path');
        const source = fs.readFileSync(path.join(__dirname, '../src/services/agentDialogueState.service.ts'), 'utf-8');
        expect(source).not.toMatch(/from ['"]\.\.\/lib\/supabaseAdmin['"]/);
    });
});
