// M-7A — Dialogue State Foundation (infrastructure only). See
// tmp/PING-M7-DIALOGUE-STATE-ADR.md for the full architecture decision this
// implements (§3 Decision, §5 minimum-viable Phase 1 scope).
//
// CRITICAL: this module is intentionally NOT imported by agentTurn.service.ts,
// agentInputInterpreter.service.ts, agentObjectiveInterpreter.service.ts,
// agentContextBuilder.service.ts, agentPlanner.service.ts,
// agentPlanOrchestrator.service.ts, agentAuthorization.service.ts,
// agentExecution.service.ts, or agentVoice.service.ts. No current Agent
// behavior depends on this file. Live wiring is a separate, later,
// physically-certified phase (ADR Q17).
//
// This module owns dialogue-state TRANSITIONS and SCOPE. It never owns
// product semantics beyond that -- it does not interpret language, does not
// resolve entities, does not call an LLM, does not write to memory_records,
// does not read/write AgentPlan/AgentAuthorization/AgentExecutionResult
// rows. Those remain exactly where they already live.
import { AppError } from '../utils/AppError';
import type {
    AgentDialogueState,
    DialogueLifecycleState,
    DialogueReferentCandidate,
    SlotCorrection,
} from '../types/agentDialogueState';
import type { AgentObjective, AgentObjectiveAmbiguity, ClarificationQuestion } from '../types/agentPlan';
import type { AgentSurface } from '../types/agentInput';

// ADR Q8 — starting defaults, explicitly not measured/tuned figures (ADR
// is explicit that these need product judgment/telemetry later). Centralized
// here, never scattered as magic numbers, exactly per the task's own
// requirement.
export const DIALOGUE_STATE_LIMITS = {
    inactivityTtlMs: 10 * 60 * 1000, // ADR Q8: ~10 min, shorter than AGENT_SESSION_TTL_MS (15 min)
    resolvedRetentionMs: 2 * 60 * 1000, // ADR Q8: ~2 min post-resolution, for an immediate undo-adjacent reference
    maxCorrectionsPerSlot: 3, // ADR Q6: bounded, supports one-level revert with headroom
    maxDialogueStates: 500, // mirrors MAX_AGENT_SESSIONS's own bound, same reasoning
} as const;

// ADR Q4 — the SOLE owner of scope-key construction. Never inlined ad hoc
// by a caller. dialogueScopeKey = conversationId when present, else
// 'agent:' + surface for conversation-less surfaces (Agent Preview /
// global Agent / future voice-only) -- this degrades safely instead of
// crashing or silently merging into an unrelated scope.
export function buildDialogueScopeKey(input: { conversationId?: string | null; surface: AgentSurface }): string {
    if (input.conversationId) return input.conversationId;
    return `agent:${input.surface}`;
}

function dialogueMapKey(actorUserId: string, dialogueScopeKey: string): string {
    return `${actorUserId}::${dialogueScopeKey}`;
}

// ADR Q5 — explicitly distinct from AgentPlanStatus/AgentAuthorizationStatus.
// Pure transition table, mirroring agentSession.service.ts's
// VOICE_TRANSITIONS/transitionVoiceSession pattern exactly.
const DIALOGUE_TRANSITIONS: Record<DialogueLifecycleState, DialogueLifecycleState[]> = {
    idle: ['collecting', 'expired'],
    collecting: ['collecting', 'clarifying', 'ready_to_plan', 'idle', 'expired'],
    clarifying: ['collecting', 'clarifying', 'ready_to_plan', 'idle', 'expired'],
    ready_to_plan: ['plan_pending_authorization', 'collecting', 'idle', 'expired'],
    // ADR §3.2/Q5 — plan_pending_authorization -> collecting MUST happen the
    // instant a referenced planDigest is invalidated by a new correction;
    // dialogue state re-opens for slot-filling rather than holding a stale
    // reference.
    plan_pending_authorization: ['collecting', 'resolved', 'idle', 'expired'],
    resolved: ['idle', 'expired'],
    expired: [],
};

export function transitionDialogueState(current: DialogueLifecycleState, next: DialogueLifecycleState): DialogueLifecycleState {
    if (!DIALOGUE_TRANSITIONS[current].includes(next)) {
        throw new AppError(`Invalid dialogue state transition: ${current} -> ${next}`, 409);
    }
    return next;
}

// ADR Q17 — persistence abstraction (interface only), so the type
// contract and lifecycle/versioning logic can be unit-tested with zero new
// infrastructure and zero migration risk before a single byte of schema is
// written. A future Postgres-checkpoint implementation is a swap behind
// this same interface, never a rewrite of the service logic below.
export interface DialogueStateRepository {
    get(actorUserId: string, dialogueScopeKey: string, now: Date): AgentDialogueState | null;
    // ADR Q12 — CAS: `expectedVersion` must equal the currently stored
    // version (or the row must not exist yet, expectedVersion === null) or
    // the write is rejected. Returns the newly stored state on success.
    save(state: AgentDialogueState, expectedVersion: number | null): AgentDialogueState;
    delete(actorUserId: string, dialogueScopeKey: string): void;
    clearForTests(): void;
}

// ADR §3.2/Q3/Q17 — Phase 1 implementation: the SAME in-process Map +
// lazy-prune pattern agentSession.service.ts already uses (Option A shape),
// never a new Redis tier, never a DB table. Deliberately not exported as a
// singleton class -- a small closure-based factory mirrors the existing
// module-level `sessions` Map convention while still remaining swappable
// and independently testable.
export function createInMemoryDialogueStateRepository(): DialogueStateRepository {
    const store = new Map<string, AgentDialogueState>();

    function isExpired(state: AgentDialogueState, now: Date): boolean {
        return Date.parse(state.expiresAt) <= now.getTime();
    }

    function prune(now: Date): void {
        for (const [key, state] of store) {
            if (isExpired(state, now)) store.delete(key);
        }
        while (store.size >= DIALOGUE_STATE_LIMITS.maxDialogueStates) {
            const oldest = store.keys().next().value;
            if (!oldest) break;
            store.delete(oldest);
        }
    }

    return {
        get(actorUserId, dialogueScopeKey, now) {
            prune(now);
            const key = dialogueMapKey(actorUserId, dialogueScopeKey);
            const state = store.get(key);
            if (!state) return null;
            if (isExpired(state, now)) {
                store.delete(key);
                return null;
            }
            return state;
        },
        save(state, expectedVersion) {
            const key = dialogueMapKey(state.actorUserId, state.dialogueScopeKey);
            const existing = store.get(key) ?? null;
            const existingVersion = existing ? existing.version : null;
            if (existingVersion !== expectedVersion) {
                throw new AppError('Dialogue state version conflict (stale write rejected)', 409);
            }
            store.set(key, state);
            return state;
        },
        delete(actorUserId, dialogueScopeKey) {
            store.delete(dialogueMapKey(actorUserId, dialogueScopeKey));
        },
        clearForTests() {
            store.clear();
        },
    };
}

// Module-level default instance, mirroring agentSession.service.ts's own
// module-level `sessions` Map convention. Not imported by any live pipeline
// file (see the header comment) -- exists so a later, separate wiring task
// has a ready-made default without needing to also decide where the
// singleton lives.
const defaultRepository = createInMemoryDialogueStateRepository();

export function clearAgentDialogueStateForTests(): void {
    defaultRepository.clearForTests();
}

function computeExpiry(lifecycle: DialogueLifecycleState, now: Date): string {
    const ttl = lifecycle === 'resolved' ? DIALOGUE_STATE_LIMITS.resolvedRetentionMs : DIALOGUE_STATE_LIMITS.inactivityTtlMs;
    return new Date(now.getTime() + ttl).toISOString();
}

function emptyState(actorUserId: string, dialogueScopeKey: string, now: Date): AgentDialogueState {
    return {
        actorUserId,
        dialogueScopeKey,
        lifecycle: 'idle',
        openObjective: null,
        ambiguities: [],
        pendingClarification: null,
        corrections: {},
        referents: [],
        currentPlanDigestRef: null,
        currentAuthorizationIdRef: null,
        version: 0,
        lastTurnSequence: 0,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        expiresAt: computeExpiry('idle', now),
    };
}

export interface DialogueStateServiceDeps {
    repository?: DialogueStateRepository;
    now?: () => Date;
}

// ADR §3.2 — Core owns state transitions; the repository only stores state
// and must never own product semantics. This class is the narrow,
// coherent transition API the task calls for -- not dozens of methods.
export class AgentDialogueStateService {
    private readonly repository: DialogueStateRepository;
    private readonly now: () => Date;

    constructor(deps: DialogueStateServiceDeps = {}) {
        this.repository = deps.repository ?? defaultRepository;
        this.now = deps.now ?? (() => new Date());
    }

    // Read-only snapshot; returns null if no state exists or it has expired
    // (live-derived expiry, ADR Q8 -- never a background sweep as the sole
    // mechanism).
    getSnapshot(actorUserId: string, dialogueScopeKey: string): AgentDialogueState | null {
        return this.repository.get(actorUserId, dialogueScopeKey, this.now());
    }

    // ADR Q1/Q5 — opens (or re-opens, per ADR §3.2's plan_pending_authorization
    // -> collecting rule) a partially-filled objective for this scope.
    // `turnSequence` is the turn this call observed; ADR Q12's CAS/
    // turn-sequence guard is enforced here, never left to the caller.
    openObjective(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        objective: AgentObjective;
        ambiguities?: AgentObjectiveAmbiguity[];
        turnId: string;
        turnSequence: number;
    }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        this.assertFreshTurn(existing, input.turnSequence);

        const base = existing ?? emptyState(input.actorUserId, input.dialogueScopeKey, now);
        // A new objective arriving on top of a `resolved` scope (the
        // immediately-preceding objective already finished) starts a fresh
        // collecting cycle -- routed through `idle` first, since `resolved`
        // cannot transition directly to `collecting` (ADR Q8: a completed
        // objective's slots must never silently resurface into a new one).
        const readyForNewObjective = base.lifecycle === 'resolved' ? transitionDialogueState(base.lifecycle, 'idle') : base.lifecycle;
        const nextLifecycle = transitionDialogueState(readyForNewObjective, 'collecting');
        const next: AgentDialogueState = {
            ...base,
            lifecycle: nextLifecycle,
            openObjective: input.objective,
            ambiguities: input.ambiguities ?? [],
            pendingClarification: null,
            // ADR §3.2 -- opening a fresh objective on top of a superseded
            // one starts a new correction ledger for that objective rather
            // than carrying forward unrelated prior-objective corrections.
            corrections: existing && existing.openObjective ? base.corrections : {},
            version: base.version,
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(nextLifecycle, now),
        };
        return this.persist(next, existing ? existing.version : null);
    }

    // ADR Q6 — pushes a bounded correction onto the named slot's stack and
    // applies the new value. Never grows unbounded (capped at
    // maxCorrectionsPerSlot). Purely a state operation -- no language
    // understanding, exactly per the task's explicit scope.
    applyCorrection(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        slotName: string;
        previousValue: string | null;
        newValue: string | null;
        reason: SlotCorrection['reason'];
        turnId: string;
        turnSequence: number;
    }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) throw new AppError('No open dialogue state to correct', 404);
        this.assertFreshTurn(existing, input.turnSequence);

        const correction: SlotCorrection = {
            slotName: input.slotName,
            previousValue: input.previousValue,
            newValue: input.newValue,
            reason: input.reason,
            turnId: input.turnId,
            correctedAt: now.toISOString(),
        };
        const stack = [...(existing.corrections[input.slotName] ?? []), correction];
        const boundedStack = stack.slice(-DIALOGUE_STATE_LIMITS.maxCorrectionsPerSlot);

        // ADR §3.2 -- a correction targeting the slot referenced by a
        // pending plan/authorization clears that reference (never mutates
        // it): the next re-plan naturally re-derives against the corrected
        // slot, and the existing digest-comparison in authorizePlan already
        // rejects any stale client-echoed digest. This service never
        // touches planDigest/authorizationId values themselves -- it only
        // clears its own REFERENCE once a correction supersedes it.
        const shouldClearPlanRef = existing.lifecycle === 'plan_pending_authorization';
        const nextLifecycle = shouldClearPlanRef ? transitionDialogueState(existing.lifecycle, 'collecting') : existing.lifecycle;

        const next: AgentDialogueState = {
            ...existing,
            lifecycle: nextLifecycle,
            corrections: { ...existing.corrections, [input.slotName]: boundedStack },
            currentPlanDigestRef: shouldClearPlanRef ? null : existing.currentPlanDigestRef,
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(nextLifecycle, now),
        };
        return this.persist(next, existing.version);
    }

    // ADR Q6 — "no, déjalo como estaba": pops the most recent correction
    // for a slot and returns the state with that correction reverted
    // (restoring `previousValue`). Safe no-op when no history exists for
    // the slot (never throws for a legitimate empty-history revert
    // attempt -- the caller/future interpreter decides how to respond to
    // the user, this service just reports there was nothing to revert via
    // the returned `reverted: false`).
    rollbackCorrection(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        slotName: string;
        turnId: string;
        turnSequence: number;
    }): { state: AgentDialogueState; reverted: boolean; restoredValue: string | null } {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) throw new AppError('No open dialogue state to roll back', 404);
        this.assertFreshTurn(existing, input.turnSequence);

        const stack = existing.corrections[input.slotName] ?? [];
        if (stack.length === 0) {
            const next: AgentDialogueState = { ...existing, lastTurnSequence: input.turnSequence, updatedAt: now.toISOString() };
            const persisted = this.persist(next, existing.version);
            return { state: persisted, reverted: false, restoredValue: null };
        }

        const popped = stack[stack.length - 1];
        const remainingStack = stack.slice(0, -1);
        const revertCorrection: SlotCorrection = {
            slotName: input.slotName,
            previousValue: popped.newValue,
            newValue: popped.previousValue,
            reason: 'user_revert',
            turnId: input.turnId,
            correctedAt: now.toISOString(),
        };
        const boundedStack = [...remainingStack, revertCorrection].slice(-DIALOGUE_STATE_LIMITS.maxCorrectionsPerSlot);

        const next: AgentDialogueState = {
            ...existing,
            corrections: { ...existing.corrections, [input.slotName]: boundedStack },
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(existing.lifecycle, now),
        };
        const persisted = this.persist(next, existing.version);
        return { state: persisted, reverted: true, restoredValue: popped.previousValue };
    }

    // ADR Q7 — stores a raw-text referent candidate only. Never a resolved
    // canonical entity ID (the type itself has no field for one).
    addReferentCandidate(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        rawText: string;
        kind: DialogueReferentCandidate['kind'];
        turnId: string;
        turnSequence: number;
    }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        this.assertFreshTurn(existing, input.turnSequence);
        const base = existing ?? emptyState(input.actorUserId, input.dialogueScopeKey, now);

        const candidate: DialogueReferentCandidate = {
            rawText: input.rawText,
            kind: input.kind,
            sourceTurnId: input.turnId,
            addedAt: now.toISOString(),
        };
        const next: AgentDialogueState = {
            ...base,
            referents: [...base.referents, candidate],
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(base.lifecycle, now),
        };
        return this.persist(next, existing ? existing.version : null);
    }

    // ADR Q5 — Core-recognized clarification question, mirrored from the
    // existing ClarificationQuestion type (never a parallel shape).
    setPendingClarification(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        clarification: ClarificationQuestion;
        turnId: string;
        turnSequence: number;
    }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) throw new AppError('No open dialogue state to clarify', 404);
        this.assertFreshTurn(existing, input.turnSequence);

        const nextLifecycle = transitionDialogueState(existing.lifecycle, 'clarifying');
        const next: AgentDialogueState = {
            ...existing,
            lifecycle: nextLifecycle,
            pendingClarification: input.clarification,
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(nextLifecycle, now),
        };
        return this.persist(next, existing.version);
    }

    // ADR §3.2/Q13 — records that a real AgentPlan reached
    // ready_for_authorization. Stores ONLY the digest reference, never a
    // copy of the plan.
    markReadyForAuthorization(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        planDigest: string;
        turnId: string;
        turnSequence: number;
    }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) throw new AppError('No open dialogue state to mark ready for authorization', 404);
        this.assertFreshTurn(existing, input.turnSequence);

        // A turn that resolves the last missing slot goes straight from
        // collecting/clarifying through ready_to_plan into
        // plan_pending_authorization within the same call -- two real
        // transitions applied in sequence, both validated against
        // DIALOGUE_TRANSITIONS, never skipped.
        const afterReadyToPlan = existing.lifecycle === 'ready_to_plan'
            ? existing.lifecycle
            : transitionDialogueState(existing.lifecycle, 'ready_to_plan');
        const nextLifecycle = transitionDialogueState(afterReadyToPlan, 'plan_pending_authorization');
        const next: AgentDialogueState = {
            ...existing,
            lifecycle: nextLifecycle,
            currentPlanDigestRef: input.planDigest,
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(nextLifecycle, now),
        };
        return this.persist(next, existing.version);
    }

    // ADR Q14 — records that a real AgentAuthorization was issued. Stores
    // ONLY the authorizationId reference.
    markAuthorized(input: {
        actorUserId: string;
        dialogueScopeKey: string;
        authorizationId: string;
        turnId: string;
        turnSequence: number;
    }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) throw new AppError('No open dialogue state to authorize', 404);
        this.assertFreshTurn(existing, input.turnSequence);

        const next: AgentDialogueState = {
            ...existing,
            currentAuthorizationIdRef: input.authorizationId,
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(existing.lifecycle, now),
        };
        return this.persist(next, existing.version);
    }

    // ADR Q5/Q8 — execution completed, or the user abandoned/cancelled, or
    // "olvida eso". Short post-resolution retention applies (ADR Q8), then
    // hard expiry.
    markResolved(input: { actorUserId: string; dialogueScopeKey: string; turnId: string; turnSequence: number }): AgentDialogueState {
        const now = this.now();
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) throw new AppError('No open dialogue state to resolve', 404);
        this.assertFreshTurn(existing, input.turnSequence);

        const nextLifecycle = transitionDialogueState(existing.lifecycle, 'resolved');
        const next: AgentDialogueState = {
            ...existing,
            lifecycle: nextLifecycle,
            lastTurnSequence: input.turnSequence,
            updatedAt: now.toISOString(),
            expiresAt: computeExpiry(nextLifecycle, now),
        };
        return this.persist(next, existing.version);
    }

    // ADR Q8 — manual reset ("olvida eso" / "empecemos de nuevo" / logout /
    // conversation switch not bleeding into a new scope). Clears the
    // objective/corrections/clarification and returns to idle, or deletes
    // the row entirely for a hard reset (e.g. logout).
    reset(input: { actorUserId: string; dialogueScopeKey: string; hardDelete?: boolean }): void {
        const now = this.now();
        if (input.hardDelete) {
            this.repository.delete(input.actorUserId, input.dialogueScopeKey);
            return;
        }
        const existing = this.repository.get(input.actorUserId, input.dialogueScopeKey, now);
        if (!existing) return;
        const nextLifecycle = transitionDialogueState(existing.lifecycle, 'idle');
        const next: AgentDialogueState = {
            ...emptyState(input.actorUserId, input.dialogueScopeKey, now),
            lifecycle: nextLifecycle,
            version: existing.version,
            lastTurnSequence: existing.lastTurnSequence,
            createdAt: existing.createdAt,
        };
        this.persist(next, existing.version);
    }

    // ADR Q12 — an older/late turn must never overwrite a newer correction.
    // A write whose observed turnSequence is not ahead of the stored
    // lastTurnSequence is rejected outright (the caller's own turn is still
    // valid/honest -- it just does not win the dialogue-state merge).
    private assertFreshTurn(existing: AgentDialogueState | null, turnSequence: number): void {
        if (existing && turnSequence <= existing.lastTurnSequence) {
            throw new AppError('Stale dialogue turn rejected (a newer turn has already been applied)', 409);
        }
    }

    private persist(next: AgentDialogueState, expectedVersion: number | null): AgentDialogueState {
        const withVersion: AgentDialogueState = { ...next, version: next.version + 1 };
        return this.repository.save(withVersion, expectedVersion);
    }
}

export function createAgentDialogueStateService(deps?: DialogueStateServiceDeps): AgentDialogueStateService {
    return new AgentDialogueStateService(deps);
}
