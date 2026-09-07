// M-3 — CANONICAL TOOL REGISTRY. Core queries this registry by toolId; no
// switch statement anywhere else in the Agent planning code decides a
// tool's side effects, authorization, or confirmation policy (sección 10).
// Every tool here maps to a REAL backend capability found during the
// mandatory audit (sección 2) — never an invented capability:
//   - get_person            -> retrieval.service.ts#resolvePerson
//   - get_conversation      -> authz.ts#assertConversationParticipant (no dedicated single-fetch service exists yet — see description)
//   - get_commitment        -> commitment.service.ts#getCommitments + utils/commitmentVisibility.ts#buildCommitmentVisibilityFilter
//   - get_commitment_proposal -> commitmentProposal.service.ts#getAgreementProposals + buildCommitmentProposalVisibilityFilter
//   - search_memory         -> memory.service.ts#retrieveMemory
//   - draft_message/draft_commitment/draft_reschedule -> no side effect, no backing write function needed
//   - send_message          -> messagingApplication.service.ts#persistUserMessage (PLANNED — never invoked in M-3)
//   - create_commitment     -> commitmentProposal.service.ts#createConfirmedCommitment (PLANNED)
//   - respond_to_proposal   -> commitmentProposal.service.ts#respondToSharedProposal (PLANNED)
//   - reschedule_commitment -> commitment.service.ts#counterProposeCommitment (PLANNED)
//   - complete_commitment   -> commitment.service.ts#resolveCommitment (PLANNED)
// Unknown toolId -> rejected by getToolContract/isKnownTool (sección 10: "No
// dynamic arbitrary tool IDs from model").
import { z } from 'zod';
import type { ToolContract } from '../types/agentPlan';

const UUID = z.string().uuid();

// Every argument schema is `.strict()` — an unexpected key is REJECTED, never
// silently stripped (sección 11/48: strict schemas, reject unexpected keys).
export const TOOL_ARGUMENT_SCHEMAS: Record<string, z.ZodTypeAny> = {
    get_person: z.object({ personId: UUID }).strict(),
    get_conversation: z.object({ conversationId: UUID }).strict(),
    get_commitment: z.object({ commitmentId: UUID }).strict(),
    get_commitment_proposal: z.object({ proposalId: UUID }).strict(),
    search_memory: z.object({ query: z.string().trim().min(1).max(200) }).strict(),

    draft_message: z.object({
        recipientPersonId: UUID,
        topicHint: z.string().trim().max(200).optional(),
    }).strict(),
    draft_commitment: z.object({
        titleHint: z.string().trim().min(1).max(120),
        dueAtHint: z.string().trim().max(60).optional(),
    }).strict(),
    draft_reschedule: z.object({
        commitmentId: UUID,
        newDueAtHint: z.string().trim().max(60),
    }).strict(),

    send_message: z.object({
        conversationId: UUID,
        recipientPersonId: UUID,
        content: z.string().trim().min(1).max(2000),
    }).strict(),
    create_commitment: z.object({
        title: z.string().trim().min(1).max(120),
        dueAt: z.string().datetime(),
        responsiblePersonId: UUID.nullable(),
        conversationId: UUID.nullable(),
    }).strict(),
    respond_to_proposal: z.object({
        proposalId: UUID,
        decision: z.enum(['approve', 'reject', 'counter_propose']),
        proposedDueAt: z.string().datetime().nullable().optional(),
    }).strict(),
    reschedule_commitment: z.object({
        commitmentId: UUID,
        newDueAt: z.string().datetime(),
    }).strict(),
    complete_commitment: z.object({
        commitmentId: UUID,
        resolutionResult: z.string().trim().min(1).max(500),
    }).strict(),
};

export const TOOL_REGISTRY: Record<string, ToolContract> = {
    get_person: {
        toolId: 'get_person', version: 1, category: 'READ', domain: 'person',
        description: 'Resolves a person by canonical ID within the actor\'s authorized relationship scope.',
        argumentNames: ['personId'], sideEffectClass: 'none', authorizationRequirement: 'actor_identity',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'read.person',
        failureModes: ['entity_not_found', 'not_authorized'],
    },
    get_conversation: {
        toolId: 'get_conversation', version: 1, category: 'READ', domain: 'conversation',
        description: 'Confirms the actor is a participant of a conversation. No dedicated single-conversation read service exists yet — backed by assertConversationParticipant only.',
        argumentNames: ['conversationId'], sideEffectClass: 'none', authorizationRequirement: 'conversation_membership',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'read.conversation',
        failureModes: ['entity_not_found', 'not_authorized'],
    },
    get_commitment: {
        toolId: 'get_commitment', version: 1, category: 'READ', domain: 'commitment',
        description: 'Retrieves one canonical commitment, scoped by owner/assignee/proposal-participant visibility.',
        argumentNames: ['commitmentId'], sideEffectClass: 'none', authorizationRequirement: 'commitment_visibility_scope',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'read.commitment',
        failureModes: ['entity_not_found', 'not_authorized'],
    },
    get_commitment_proposal: {
        toolId: 'get_commitment_proposal', version: 1, category: 'READ', domain: 'commitment_proposal',
        description: 'Retrieves one shared or solo commitment proposal, scoped by proposer/participant visibility.',
        argumentNames: ['proposalId'], sideEffectClass: 'none', authorizationRequirement: 'proposal_visibility_scope',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'read.commitment_proposal',
        failureModes: ['entity_not_found', 'not_authorized'],
    },
    search_memory: {
        toolId: 'search_memory', version: 1, category: 'READ', domain: 'memory',
        description: 'Searches the actor\'s own canonical memory records (M-2). Sensitivity/currency filtering for planning use happens in the planner, never here.',
        argumentNames: ['query'], sideEffectClass: 'none', authorizationRequirement: 'actor_identity',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'read.memory',
        failureModes: [],
    },

    draft_message: {
        toolId: 'draft_message', version: 1, category: 'DRAFT', domain: 'messaging',
        description: 'Produces suggested message wording for a recipient. No message is sent.',
        argumentNames: ['recipientPersonId', 'topicHint'], sideEffectClass: 'none', authorizationRequirement: 'actor_identity',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'draft.message',
        failureModes: [],
    },
    draft_commitment: {
        toolId: 'draft_commitment', version: 1, category: 'DRAFT', domain: 'commitment',
        description: 'Produces a suggested new-commitment payload. Nothing is created.',
        argumentNames: ['titleHint', 'dueAtHint'], sideEffectClass: 'none', authorizationRequirement: 'actor_identity',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'draft.commitment',
        failureModes: [],
    },
    draft_reschedule: {
        toolId: 'draft_reschedule', version: 1, category: 'DRAFT', domain: 'commitment',
        description: 'Produces a suggested new due date for an existing commitment. Nothing is changed.',
        argumentNames: ['commitmentId', 'newDueAtHint'], sideEffectClass: 'none', authorizationRequirement: 'commitment_visibility_scope',
        confirmationPolicy: 'none', supportsDryRun: true, availability: 'available_now',
        requiredContext: ['actorUserId'], auditCategory: 'draft.reschedule',
        failureModes: ['entity_not_found'],
    },

    send_message: {
        toolId: 'send_message', version: 1, category: 'WRITE', domain: 'messaging',
        description: 'Sends a real message in a conversation. PLANNING ONLY in M-3 — no invoke() exists.',
        argumentNames: ['conversationId', 'recipientPersonId', 'content'], sideEffectClass: 'state_change',
        authorizationRequirement: 'conversation_membership', confirmationPolicy: 'explicit',
        supportsDryRun: true, availability: 'planned_future', requiredContext: ['actorUserId'],
        auditCategory: 'write.message', failureModes: ['not_authorized', 'missing_context'],
    },
    create_commitment: {
        toolId: 'create_commitment', version: 1, category: 'WRITE', domain: 'commitment',
        description: 'Creates a new commitment or proposal. PLANNING ONLY in M-3. Confirmation is ALWAYS explicit — commitments/proposals are never auto-created (product rule, sección 37).',
        argumentNames: ['title', 'dueAt', 'responsiblePersonId', 'conversationId'], sideEffectClass: 'state_change',
        authorizationRequirement: 'actor_identity', confirmationPolicy: 'explicit',
        supportsDryRun: true, availability: 'planned_future', requiredContext: ['actorUserId'],
        auditCategory: 'write.commitment', failureModes: ['missing_context', 'not_authorized'],
    },
    respond_to_proposal: {
        toolId: 'respond_to_proposal', version: 1, category: 'WRITE', domain: 'commitment_proposal',
        description: 'Responds to a shared/solo proposal as the actor\'s own required response. PLANNING ONLY in M-3. No target-participant argument exists — an actor can never respond on behalf of someone else, matching the real RPC contract.',
        argumentNames: ['proposalId', 'decision', 'proposedDueAt'], sideEffectClass: 'state_change',
        authorizationRequirement: 'proposal_response_actor', confirmationPolicy: 'explicit',
        supportsDryRun: true, availability: 'planned_future', requiredContext: ['actorUserId'],
        auditCategory: 'write.commitment_proposal', failureModes: ['not_authorized', 'invalid_lifecycle', 'entity_not_found'],
    },
    reschedule_commitment: {
        toolId: 'reschedule_commitment', version: 1, category: 'WRITE', domain: 'commitment',
        description: 'Counter-proposes a new date on an existing, already-canonical commitment. PLANNING ONLY in M-3.',
        argumentNames: ['commitmentId', 'newDueAt'], sideEffectClass: 'state_change',
        authorizationRequirement: 'commitment_owner_or_assignee', confirmationPolicy: 'explicit',
        supportsDryRun: true, availability: 'planned_future', requiredContext: ['actorUserId'],
        auditCategory: 'write.commitment', failureModes: ['not_authorized', 'invalid_lifecycle', 'entity_not_found'],
    },
    complete_commitment: {
        toolId: 'complete_commitment', version: 1, category: 'WRITE', domain: 'commitment',
        description: 'Marks an existing, already-canonical commitment resolved. PLANNING ONLY in M-3.',
        argumentNames: ['commitmentId', 'resolutionResult'], sideEffectClass: 'state_change',
        authorizationRequirement: 'commitment_owner_or_assignee', confirmationPolicy: 'explicit',
        supportsDryRun: true, availability: 'planned_future', requiredContext: ['actorUserId'],
        auditCategory: 'write.commitment', failureModes: ['not_authorized', 'invalid_lifecycle', 'entity_not_found'],
    },
};

export function isKnownTool(toolId: string): boolean {
    return Object.prototype.hasOwnProperty.call(TOOL_REGISTRY, toolId);
}

export function getToolContract(toolId: string): ToolContract | null {
    if (!isKnownTool(toolId)) return null;
    return TOOL_REGISTRY[toolId];
}

export function getToolArgumentSchema(toolId: string): z.ZodTypeAny | null {
    if (!isKnownTool(toolId)) return null;
    return TOOL_ARGUMENT_SCHEMAS[toolId] ?? null;
}
