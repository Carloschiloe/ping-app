// M-7A — Dialogue State Foundation (infrastructure only, section per
// tmp/PING-M7-DIALOGUE-STATE-ADR.md §5 "Minimum-viable Phase 1 implementation
// scope"). This file defines the type contract ONLY. Nothing in this file
// is wired into any live Agent pipeline — see the ADR's Q17/§4 for why
// live integration is a deliberately separate, later phase.
//
// Canonical invariants this contract exists to make representable (never to
// enforce by itself — enforcement is agentDialogueState.service.ts's job):
//   - Dialogue state is advisory conversational state only, never canonical
//     truth about commitments/people/messages/permissions/plans/
//     authorizations/executions (ADR §Core invariant 2).
//   - Resolved canonical entities are NEVER embedded here as trusted facts
//     -- only raw-text candidates (ADR Q7). `AgentObjective.targetEntities`
//     is reused verbatim for exactly this reason: it already documents
//     "raw text, never IDs" (agentPlan.ts:130-131).
//   - `currentPlanDigestRef`/`currentAuthorizationIdRef` are REFERENCES
//     only -- dialogue state never duplicates AgentPlan/AgentAuthorization
//     state machines (ADR Q2, Q13, Q14).
import type { AgentObjective, AgentObjectiveAmbiguity, ClarificationQuestion } from './agentPlan';
import type { RetrievalTimeRange } from './retrieval';

// ADR Q5 — explicitly distinct from AgentPlanStatus ('draft' |
// 'needs_clarification' | 'ready_for_authorization') and
// AgentAuthorizationStatus ('pending' | 'authorized' | 'consumed' |
// 'expired' | 'revoked') -- no shared enum values, no field-name overlap.
export type DialogueLifecycleState =
    | 'idle'
    | 'collecting'
    | 'clarifying'
    | 'ready_to_plan'
    | 'plan_pending_authorization'
    | 'resolved'
    | 'expired';

// ADR Q6 — bounded per-slot correction stack, never an unbounded event log.
// Cap enforced by the service (DIALOGUE_STATE_LIMITS.maxCorrectionsPerSlot),
// not by this type.
export interface SlotCorrection {
    slotName: string;
    previousValue: string | null;
    newValue: string | null;
    reason: 'user_correction' | 'user_revert' | 'clarification_answer';
    turnId: string;
    correctedAt: string;
}

// ADR Q7 — a REFERENT CANDIDATE is a raw-text descriptor only. It is never
// a resolved canonical entity ID, and its presence here grants no
// authority: whatever later re-references it must re-run live canonical
// resolution (resolvePersonHint/resolveEntityHint) exactly as if the text
// had just been typed. `canonicalEntityId` is intentionally OMITTED from
// this type -- there is nothing here for a future maintainer to
// accidentally treat as trustworthy.
export interface DialogueReferentCandidate {
    rawText: string;
    kind: 'person' | 'entity' | 'unspecified';
    sourceTurnId: string;
    addedAt: string;
}

// Bounded read continuity: only a Core-derived temporal scope is retained,
// never raw user text, retrieved rows, entity IDs or permissions. This lets a
// follow-up such as "¿Cuál es el más temprano?" stay inside the immediately
// preceding "mañana" window without turning dialogue state into memory.
export interface AgentReadContext {
    kind: 'commitment_query';
    timeRange: RetrievalTimeRange | null;
    sourceTurnId: string;
}

// ADR Q1/Q2 — the minimum cross-turn state: one open, partially-filled
// AgentObjective, its correction history, its referent candidates, and
// (only once they exist) references to the canonical systems that own the
// rest of the pipeline. Reuses AgentObjective/AgentObjectiveAmbiguity/
// ClarificationQuestion verbatim -- never a parallel/duplicated shape.
export interface AgentDialogueState {
    // ADR Q4 — scope key: (actorUserId, dialogueScopeKey), always
    // multi-row per actor, never a singleton. dialogueScopeKey is
    // `conversationId` when present, else `'agent:' + surface` for
    // conversation-less surfaces (Agent Preview / global Agent / future
    // voice-only). Construction owned by buildDialogueScopeKey (service),
    // never inlined ad hoc by a caller.
    actorUserId: string;
    dialogueScopeKey: string;

    lifecycle: DialogueLifecycleState;

    // ADR Q15 — singular by design for Phase 1 (multi-objective composition
    // is explicitly out of scope, not precluded). A future
    // `openObjectives: AgentObjective[]` would be an additive field change,
    // never a rescoping, because the scope key already supports N
    // concurrent dialogue states per actor (one per conversation-or-global
    // bucket), not N objectives inside one row.
    openObjective: AgentObjective | null;
    ambiguities: AgentObjectiveAmbiguity[];
    pendingClarification: ClarificationQuestion | null;

    // Bounded per-slot correction stacks, keyed by slot name (e.g.
    // 'timeConstraints.rawHint'). Cap enforced by the service.
    corrections: Record<string, SlotCorrection[]>;

    // ADR Q7 — raw-text-only referent candidates, never resolved IDs.
    referents: DialogueReferentCandidate[];

    // Short-lived, derived scope for read-only comparative follow-ups.
    lastReadContext?: AgentReadContext | null;

    // ADR Q13/Q14 — REFERENCES only, never copies. Cleared the instant a
    // correction supersedes them (Q13's UX-honesty rule), never treated as
    // proof of continued validity -- the owning system (agentAuthorization
    // .service.ts's re-plan, agentExecution.service.ts's claim semantics)
    // is always the actual source of truth.
    currentPlanDigestRef: string | null;
    currentAuthorizationIdRef: string | null;

    // ADR Q12 — monotonic turn sequence + optimistic version, reusing the
    // exact `UPDATE ... WHERE version = $expected` CAS idiom already
    // proven in claim_agent_authorization_for_execution /
    // claim_agent_execution_step. A write is applied only if the turn
    // sequence it observed is still the latest AND version still matches
    // what was read -- an older/late response is silently dropped, never
    // allowed to overwrite a newer correction.
    version: number;
    lastTurnSequence: number;

    createdAt: string;
    updatedAt: string;
    // ADR Q8 — live-derived expiry (checked at read time), never a
    // background sweep as the sole mechanism. Exact value assigned by the
    // service per DIALOGUE_STATE_LIMITS (inactivity TTL, or the shorter
    // post-resolution retention once lifecycle === 'resolved').
    expiresAt: string;
}

// ADR Q11 — bounded structured context handed to an interpreter prompt
// builder, mirroring the existing interpreter payload discipline (schema-
// validated, small). NEVER: full conversation transcript, resolved entity
// IDs, authorization/plan internals, memory_records content. This type
// describes the SHAPE only -- no prompt-building or LLM-calling code is
// part of M-7A (no live wiring, per the task's explicit scope).
export interface DialogueContextForLLM {
    activeObjectiveType: AgentObjective['objectiveType'] | null;
    knownSlots: Record<string, string>;
    missingSlots: string[];
    candidateEntities: string[];
    pendingClarification: { reason: string; candidateLabels?: string[] } | null;
    recentCorrections: { slotName: string; previousValue: string | null }[];
}

// ADR Q11 — the one new field a future interpreter payload would gain.
// Not wired into any actual interpreter schema in M-7A.
export interface DialogueSlotUpdateClaim {
    slotUpdateFor: string | null;
}
