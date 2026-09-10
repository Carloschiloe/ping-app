// M-3 — AGENT PLANNING + TOOL CONTRACTS.
//
// PLAN, never ACT. Every type here describes a structure that Core builds
// and validates deterministically; an LLM may PROPOSE fragments of an
// AgentObjective (never a tool ID, never a canonical entity ID, never a
// risk/authorization/confirmation decision — sección 1/6/11), but nothing
// in this file is ever trusted from raw model output before passing through
// agentPlanValidator.service.ts. No field here implies that a write ever
// happened (sección 9) — an AgentPlan is a dry-run description of what
// WOULD happen if a future M-4 execution layer authorized and ran it.

// ─── Tool taxonomy (sección 4) ──────────────────────────────────────────────
export type ToolCategory = 'READ' | 'DRAFT' | 'WRITE' | 'EXTERNAL';

// ─── Side-effect classification (sección 5) — owned by the registry, never
// by the LLM, never overridden per-plan. ────────────────────────────────────
export type SideEffectClass =
    | 'none'                  // reads and drafts — no state changes anywhere
    | 'reversible'            // a write the actor (or Core) can trivially undo (e.g. re-editing a draft-only field)
    | 'state_change'          // a real domain write: send a message, create/accept/reschedule/complete a commitment
    | 'external_irreversible' // a future EXTERNAL-category action with no undo path (calendar, email, third-party APIs)
    | 'high_risk';            // a state_change escalated by real context (e.g. a shared commitment with other participants)

// ─── Authorization contract (sección 6) — each value maps 1:1 to a REAL
// check that already exists in the codebase (backend/src/utils/authz.ts,
// buildCommitmentVisibilityFilter, getProposalParticipationState / the
// already-precomputed RetrievalCommitment.actorCanRespond), never an
// invented category with no backing enforcement. ────────────────────────────
export type AuthorizationRequirement =
    | 'none'
    | 'actor_identity'                 // just needs a real authenticated actor (e.g. reading one's own memory)
    | 'conversation_membership'        // assertConversationParticipant
    | 'commitment_visibility_scope'    // buildCommitmentVisibilityFilter: owner OR assignee OR proposal_id participant bridge
    | 'commitment_owner'               // assertCommitmentOwner
    | 'commitment_owner_or_assignee'   // assertCommitmentOwnerOrResponsible / commitmentTransitions.ts#actorRole
    | 'proposal_visibility_scope'      // buildCommitmentProposalVisibilityFilter: proposer OR participant
    | 'proposal_response_actor'        // RetrievalCommitment.actorCanRespond === true (RPC respond_to_commitment_proposal's real gate)
    | 'proposal_owner'                 // RPC confirm_commitment_proposal / reject_commitment_proposal_with_evidence: proposed_by_user_id === actor
    | 'explicit_user_confirmation';    // the write itself requires a distinct, separate confirmation step in a future M-4 (never implied by asking)

// ─── Confirmation policy (sección 37) — encoded on the tool contract, never
// "remembered informally": commitments/proposals are NEVER auto-created
// without explicit confirmation, and that rule lives here, not in a comment. ─
export type ConfirmationPolicy =
    | 'none'
    | 'implicit'          // the user's own utterance already IS the confirmation (e.g. "sí, acéptalo")
    | 'explicit'          // a distinct yes/no confirmation is required before execution
    | 'strong_explicit';  // reserved for irreversible/high_risk actions — a stronger, unambiguous confirmation (future M-4 UX)

export type ToolAvailability = 'available_now' | 'planned_future' | 'disabled' | 'unsupported';

// ─── ToolContract (sección 3) — a tool is a CAPABILITY exposed to the Agent,
// never merely "call this service function." Every field here is justified
// by a concrete planning need used elsewhere in this file/the validator. ────
export interface ToolContract {
    toolId: string;
    version: number;
    category: ToolCategory;
    domain: 'person' | 'conversation' | 'commitment' | 'commitment_proposal' | 'memory' | 'messaging';
    description: string;
    // Argument shape validated by the registry — kept as a plain descriptor
    // (name -> required/type) rather than embedding a full validation
    // library type here, so this file has no runtime dependency; the actual
    // zod schema used to validate arguments lives in toolRegistry.service.ts
    // next to the contract it belongs to (sección 11/48 — strict, reject
    // unknown keys).
    argumentNames: string[];
    sideEffectClass: SideEffectClass;
    authorizationRequirement: AuthorizationRequirement;
    confirmationPolicy: ConfirmationPolicy;
    supportsDryRun: boolean;
    availability: ToolAvailability;
    // Context fields the planner MUST have already resolved before this tool
    // can appear in a step (sección 11: Core resolves IDs, never trusts the
    // LLM) — e.g. ['actorUserId'], ['actorUserId', 'recipientPersonId'].
    requiredContext: string[];
    auditCategory: string;
    failureModes: AgentPlanFailureMode[];
}

// ─── AgentObjective (sección 7) — user intent turned into a structured,
// never free-text-only, canonical objective. ────────────────────────────────
export type AgentObjectiveType =
    | 'communicate_message'
    | 'communicate_and_wait'
    | 'create_commitment_or_proposal'
    | 'create_personal_commitment'
    | 'reschedule_existing_commitment'
    | 'complete_existing_commitment'
    | 'respond_to_existing_proposal'
    | 'unsupported';

export type AmbiguityKind = 'blocking' | 'non_blocking';

export interface AgentObjectiveAmbiguity {
    field: string;
    kind: AmbiguityKind;
    reason: string;
    // Grounded candidates only (sección 16) — never invented options.
    candidates?: { id: string; label: string }[];
}

// Smallest canonical contract extension for send_message content (sección
// 1/36: "LLM/interpreter suggests; Core decides"). A `communicate_message`/
// `communicate_and_wait` interpreter (deterministic OR llm) may PROPOSE the
// outgoing payload only as a VERBATIM candidate substring — never as an
// offset/index (JS string offsets are UTF-16 code-unit positions, which a
// proposer cannot be trusted to compute/report correctly across all of
// Ping's supported Unicode text, and which — more importantly — could be
// used to smuggle replacement text under the guise of "just a position").
// `verbatimText` must be text the proposer claims literally appears in
// `sourceUtterance`. It is only a candidate: agentPlanner.service.ts (Core)
// is the sole place that turns it into executable
// `send_message.arguments.content`, and it does so by independently
// locating that string inside the real `sourceUtterance` — an exact
// `indexOf`/`slice` match first, falling back to a Unicode-aware
// case-insensitive comparison ONLY when exact fails (see
// agentPlanner.service.ts#findOccurrences for why every resulting index/
// boundary is always derived from the original `sourceUtterance` itself,
// never from a lowercased/normalized copy) — and validating uniqueness/
// region/non-emptiness — never by trusting a position the proposer supplied.
export interface MessageContentCandidate {
    verbatimText: string;
    extractionMode: 'delimiter_colon' | 'delimiter_quote' | 'semantic_verbatim';
}

export interface AgentObjective {
    objectiveType: AgentObjectiveType;
    targetEntities: {
        personHints: string[];   // raw text, never IDs — resolved later by the planner via context.entities.people
        entityHints: string[];   // raw text naming a commitment/proposal (e.g. "Entrenar"), never an ID
    };
    constraints: {
        decisionHint?: 'approve' | 'reject' | 'counter_propose' | null; // for respond_to_existing_proposal
        draftOnly?: boolean; // true only when the user explicitly asked for a preview, never inferred silently
        responsibleHint?: string | null; // raw text naming who should be responsible for a new commitment
    };
    desiredOutcome: string;   // short, human-readable restatement — never independently hallucinated prose (sección 27)
    timeConstraints: {
        rawHint: string | null;
    };
    actor: string; // actorUserId — always the authenticated caller, never model-supplied
    sourceUtterance: string;
    confidence: number; // 0..1
    ambiguities: AgentObjectiveAmbiguity[];
    source: 'deterministic' | 'llm' | 'llm_fallback';
    fallbackReason?: string;
    modelUsed?: string;
    // Set only for communicate_message/communicate_and_wait — see
    // MessageContentCandidate. Absent/null means no safe candidate was
    // found; Core must never invent one.
    communicateContentCandidate?: MessageContentCandidate | null;
}

// ─── Plan states (sección 9) — exactly these three. No fake "executed". ────
export type AgentPlanStatus = 'draft' | 'needs_clarification' | 'ready_for_authorization';

export type PlanStepStatus = 'pending' | 'blocked';

export type RollbackCapability = 'none' | 'reversible_by_owner' | 'not_applicable_read_only';

export interface PlanStepCondition {
    type: 'always' | 'after_step_result' | 'wait_for_response';
    dependsOnStepId?: string;
    description: string;
}

export interface PlanStepProvenance {
    // A short excerpt of the source utterance this step was derived from —
    // never independently hallucinated (sección 28).
    sourceUtteranceSpan?: string;
    resolvedFrom: 'user_text' | 'entity_resolution' | 'memory' | 'canonical_context' | 'global_conversation_resolution';
    canonicalSourceRefs: { sourceType: string; sourceId: string }[];
}

export interface AgentPlanStep {
    stepId: string;
    toolId: string;
    toolVersion: number;
    operation: string;
    arguments: Record<string, unknown>;
    dependsOn: string[];
    condition: PlanStepCondition;
    expectedEffect: string;
    authorizationRequirement: AuthorizationRequirement;
    confirmationRequirement: ConfirmationPolicy;
    sideEffectClass: SideEffectClass;
    riskLevel: 'low' | 'medium' | 'high';
    preconditions: string[];
    postconditions: string[];
    rollbackCapability: RollbackCapability;
    provenance: PlanStepProvenance;
    status: PlanStepStatus;
}

// ─── Failure taxonomy (sección 45) — known classes only, never a generic
// "something went wrong". ────────────────────────────────────────────────────
export type AgentPlanFailureMode =
    | 'unsupported_capability'
    | 'needs_clarification'
    | 'entity_not_found'
    | 'ambiguous_entity'
    | 'not_authorized'
    | 'invalid_lifecycle'
    | 'missing_context'
    | 'policy_blocked';

export interface AgentPlanValidationIssue {
    code: AgentPlanFailureMode;
    message: string;
    stepId?: string;
}

export interface AgentPlanValidationResult {
    valid: boolean;
    issues: AgentPlanValidationIssue[];
}

export interface ClarificationQuestion {
    field: string;
    question: string;
    options?: { id: string; label: string }[];
}

export interface AgentPlanRiskSummary {
    highestRiskLevel: 'low' | 'medium' | 'high';
    riskLevelCounts: Record<'low' | 'medium' | 'high', number>;
}

// ─── AgentPlan (sección 8) ───────────────────────────────────────────────────
export interface AgentPlan {
    planId: string;
    objective: AgentObjective;
    status: AgentPlanStatus;
    steps: AgentPlanStep[];
    requiredConfirmations: ConfirmationPolicy[];
    unresolvedInputs: ClarificationQuestion[];
    riskSummary: AgentPlanRiskSummary;
    canExecute: boolean;
    createdAt: string;
    validation: AgentPlanValidationResult;
    failureMode?: AgentPlanFailureMode;
    humanReadableSummary: string;
    traceId?: string;
    // M-4 (sección 5/9/10) — fingerprint determinístico del contenido
    // material del plan (agentPlanDigest.service.ts#computePlanDigest,
    // calculado por el orquestador para evitar un import circular con este
    // archivo de tipos). Nunca contiene datos sensibles -- es un hash, no el
    // plan serializado. Presente sólo cuando status==='ready_for_authorization'
    // (nunca tiene sentido autorizar un plan bloqueado/incompleto).
    planDigest?: string;
}

// ─── Public response DTO (sección 38) — deliberately minimal, mirrors the
// discipline of types/agent.ts#AgentPublicResponse: never leaks internal
// validator diagnostics beyond what a client legitimately needs to render
// "here is what I would do" and, if blocked, why. ────────────────────────────
export interface AgentPlanPublicStep {
    stepId: string;
    toolId: string;
    operation: string;
    dependsOn: string[];
    expectedEffect: string;
    sideEffectClass: SideEffectClass;
    riskLevel: 'low' | 'medium' | 'high';
    confirmationRequirement: ConfirmationPolicy;
    conditionDescription: string;
}

export interface AgentPlanPublicResponse {
    planId: string;
    status: AgentPlanStatus;
    objectiveType: AgentObjectiveType;
    humanReadableSummary: string;
    steps: AgentPlanPublicStep[];
    canExecute: boolean;
    clarification?: ClarificationQuestion[];
    failureMode?: AgentPlanFailureMode;
    failureMessage?: string;
    // M-4 — el cliente debe ecoar este valor tal cual en POST /agent/authorize
    // (nunca reconstruirlo) para que Core pueda comparar contra el digest
    // que re-deriva desde cero en ese momento (sección 9/10/74: nunca se
    // confía en un plan JSON devuelto por el cliente, sólo en este hash).
    planDigest?: string;
}

export function toPublicAgentPlanResponse(plan: AgentPlan): AgentPlanPublicResponse {
    const primaryIssue = plan.validation.issues[0];
    return {
        planId: plan.planId,
        status: plan.status,
        objectiveType: plan.objective.objectiveType,
        humanReadableSummary: plan.humanReadableSummary,
        planDigest: plan.status === 'ready_for_authorization' ? plan.planDigest : undefined,
        steps: plan.steps.map((step) => ({
            stepId: step.stepId,
            toolId: step.toolId,
            operation: step.operation,
            dependsOn: step.dependsOn,
            expectedEffect: step.expectedEffect,
            sideEffectClass: step.sideEffectClass,
            riskLevel: step.riskLevel,
            confirmationRequirement: step.confirmationRequirement,
            conditionDescription: step.condition.description,
        })),
        canExecute: plan.canExecute,
        clarification: plan.status === 'needs_clarification' ? plan.unresolvedInputs : undefined,
        failureMode: plan.failureMode,
        failureMessage: plan.failureMode ? primaryIssue?.message : undefined,
    };
}

// ─── Scale/security limits (sección 47) ──────────────────────────────────────
export const AGENT_PLAN_LIMITS = {
    maxSteps: 8,
    maxDependencyDepth: 4,
    maxParallelSteps: 4,
} as const;
