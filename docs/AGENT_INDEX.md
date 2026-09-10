# Ping Agent Index

This is the domain handbook for coding agents. It names the smallest useful entry set, not every implementation file.

## Token-discipline contract

Follow this path:

`TASK → AGENT_TASK_ROUTER → matching AGENT_INDEX section → 2–6 source files → DEPENDENCY_MAP if necessary → import-index only for direct graph questions`

Broad repository search is a fallback, not the first step.

Never:

- read all backend services;
- read all tests;
- grep the entire repository before checking the router;
- repeatedly reopen files whose responsibility is already understood;
- rerun the full suite after every edit;
- paste a full log when one assertion explains the failure.

Start with a focused failing test. Expand only when an observed dependency requires it.

## Core domains

### Authentication / actor

**Purpose:** Establish the authenticated Supabase user as the actor for every protected backend operation and attach that identity to the request.
**Canonical owner:** Supabase Auth for identity; `backend/src/middleware/auth.ts` for backend request enforcement.
**Read first:**

- `backend/src/middleware/auth.ts`
- `backend/src/utils/authz.ts`
- `mobile/src/context/AuthContext.tsx`
- `mobile/src/api/client.ts`

**Direct dependencies:** `backend/src/lib/supabaseAdmin.ts`, bearer token, profiles/memberships.
**Used by:** Protected API routes, retrieval, application services, Agent authorization/execution.
**Tests:** `backend/tests/authz.test.ts`, `mobile/tests/authRegistration.test.ts`, `mobile/tests/authRedirect.test.ts`.
**Common symptoms:** `401`, invalid token, missing actor, cross-user access.
**Usually do not read:** AI prompts, presentation components, notification code.

### People / identity resolution

**Purpose:** Convert user-provided names/emails/phones into canonical visible users or owned contacts without trusting an LLM-generated ID.
**Canonical owner:** `resolvePerson` in `backend/src/services/retrieval.service.ts`; ownership and shared-profile rules in `backend/src/utils/authz.ts`.
**Read first:**

- `backend/src/services/retrieval.service.ts`
- `backend/src/controllers/user.controller.ts`
- `backend/src/services/contact.service.ts`
- `backend/src/utils/contactDiscovery.ts`

**Direct dependencies:** profiles, contacts, conversation memberships, normalized phone/name input.
**Used by:** Agent context, planner, memory subject resolution, conversation creation.
**Tests:** `backend/tests/retrievalService.test.ts`, `backend/tests/contactService.test.ts`, `backend/tests/contactDiscovery.test.ts`.
**Common symptoms:** Alejandra not found, duplicate name, ambiguous person, invented recipient ID.
**Usually do not read:** Mobile Agent cards or tool executors until identity resolution itself is proven correct.

### Conversations

**Purpose:** Own DIRECT, self-chat, and group containers plus participant membership and lifecycle.
**Canonical owner:** `backend/src/services/conversationApplication.service.ts` backed by canonical conversation RPCs; HTTP compatibility lives in `backend/src/controllers/conversation.controller.ts`.
**Read first:**

- `backend/src/services/conversationApplication.service.ts`
- `backend/src/services/conversation.service.ts`
- `backend/src/controllers/conversation.controller.ts`
- `backend/src/services/retrieval.service.ts`
- `mobile/src/api/query-modules/conversations.ts`

**Direct dependencies:** conversations, conversation_participants, `backend/src/utils/authz.ts`, memory invalidation.
**Used by:** Messaging, commitments, attachments, Agent recipient resolution, Chat.
**Tests:** `backend/tests/conversationService.test.ts`, `backend/tests/conversationCompat.test.ts`, `backend/tests/retrievalService.test.ts`, `mobile/tests/conversationCompat.test.ts`.
**Common symptoms:** wrong `conversationId`, self-chat duplication, group chosen as direct, revoked member still reading.
**Usually do not read:** Group operation/checklist code unless the failure is explicitly group administration.

### Messaging

**Purpose:** Persist real user/system messages, receipts, read state, idempotency, tombstones, and canonical attachment claims.
**Canonical owner:** `backend/src/services/messagingApplication.service.ts`; route/controller adapters feed it through current conversation flows.
**Read first:**

- `backend/src/services/messagingApplication.service.ts`
- `backend/src/controllers/conversation.controller.ts`
- `backend/src/services/message.service.ts`
- `mobile/src/hooks/useChatMessages.ts`
- `mobile/src/api/query-modules/conversations.ts`

**Direct dependencies:** messaging RPCs, conversation authorization, attachments, memory invalidation, Realtime reconciliation.
**Used by:** Chat, Agent `send_message`, suggestions, shared content, receipts.
**Tests:** `backend/tests/messageService.test.ts`, `backend/tests/messageAuthorization.test.ts`, `backend/tests/messagingWriterGuard.test.ts`, `mobile/tests/messageReconciliation.test.ts`, `mobile/tests/messageReceipts.test.ts`.
**Common symptoms:** duplicate message, stale optimistic row, receipt mismatch, tombstoned content visible.
**Usually do not read:** Legacy AI history unless the failing endpoint is `/ai/*`.

### Commitments

**Purpose:** Own confirmed Commitment creation, editable fields, explicit lifecycle transitions, resolution, archival, evidence, and audit.
**Canonical owner:** `backend/src/services/commitmentApplication.service.ts`. Canonical lifecycle operations delegate to `backend/src/services/commitment.service.ts` and atomic database RPCs.
**Read first:**

- `backend/src/services/commitmentApplication.service.ts`
- `backend/src/services/commitment.service.ts`
- `backend/src/utils/commitmentTransitions.ts`
- `backend/src/utils/commitmentStatus.ts`
- `backend/src/controllers/commitment.controller.ts`

**Direct dependencies:** Commitment RPCs, proposal service, authorization rules, messages/events, memory events.
**Used by:** Hoy, Compromisos, Agent tools, notifications, retrieval.
**Tests:** `backend/tests/commitmentCoreVertical.test.ts`, `backend/tests/commitmentTransitions.test.ts`, `backend/tests/commitmentWriterGuard.test.ts`, `backend/tests/commitmentService.test.ts`.
**Common symptoms:** lifecycle changed by generic PATCH, state without event/evidence, legacy status mismatch.
**Usually do not read:** Calls, Calendar, or Operation satellite writers unless the task explicitly targets those allowlisted legacy integrations.

### Proposal lifecycle

**Purpose:** Keep AI/user suggestion and shared agreement proposals separate from materialized commitments until required participants approve.
**Canonical owner:** `backend/src/services/commitmentProposal.service.ts`; participation truth is derived by `backend/src/utils/proposalParticipation.ts`.
**Read first:**

- `backend/src/services/commitmentProposal.service.ts`
- `backend/src/utils/proposalParticipation.ts`
- `backend/src/utils/commitmentVisibility.ts`
- `mobile/src/utils/commitmentConfirmDispatch.ts`
- `mobile/src/api/query-modules/commitmentConfirmRequests.ts`

**Direct dependencies:** commitment_proposals, commitment_proposal_responses, canonical confirmation/materialization RPCs.
**Used by:** message suggestions, Hoy, Compromisos, Agent proposal response executor.
**Tests:** `backend/tests/proposalParticipation.test.ts`, `backend/tests/commitmentProposalService.test.ts`, `backend/tests/proposalParticipation.test.ts`, `mobile/tests/commitmentProposalConfirmDispatch.test.ts`.
**Common symptoms:** pending proposal treated overdue, wrong actor can respond, materialized too early, waiting state wrong.
**Usually do not read:** Generic Commitment edit UI until proposal-vs-commitment classification is confirmed.

### Hoy

**Purpose:** Present commitments relevant to the actor for today, overdue attention, filtering, and primary actions.
**Canonical owner:** Current tab entry is `mobile/src/screens/TaskDashboardScreen.tsx`; lifecycle truth remains backend Commitment Core.
**Read first:**

- `mobile/src/screens/TaskDashboardScreen.tsx`
- `mobile/src/utils/commitmentDisplay.ts`
- `mobile/src/utils/commitmentPrimaryAction.ts`
- `backend/src/utils/overdueSemantics.ts`
- `backend/src/services/retrieval.service.ts`

**Direct dependencies:** `/commitments`, `/commitment-proposals`, canonical status normalization, actor relevance.
**Used by:** Main `Hoy` tab and parity-sensitive Agent answers.
**Tests:** `mobile/tests/overdueUiAgentParity.test.ts`, `mobile/tests/overdueSemantics.test.ts`, `backend/tests/overdueUiAgentParity.test.ts`, `backend/tests/overdueSemantics.test.ts`.
**Common symptoms:** wrong overdue count, proposal shown overdue, UI/Agent disagreement.
**Usually do not read:** `mobile/src/screens/HoyScreen.tsx`; it exists but is not the current tab entry point.

### Attachments

**Purpose:** Own private upload intent, completion, atomic message attachment, read authorization, tombstone behavior, and legacy bucket/path adaptation.
**Canonical owner:** `backend/src/services/attachmentApplication.service.ts`; signed storage operations are contained by `backend/src/services/privateFile.service.ts`.
**Read first:**

- `backend/src/services/attachmentApplication.service.ts`
- `backend/src/controllers/attachment.controller.ts`
- `backend/src/services/privateFile.service.ts`
- `mobile/src/hooks/useMediaPicker.ts`
- `mobile/src/hooks/useSharedContentUrl.ts`

**Direct dependencies:** private `chat-media` bucket, Attachment RPCs, conversation membership, Messaging Core.
**Used by:** Chat media, audio, documents, shared content.
**Tests:** `backend/tests/attachmentService.test.ts`, `backend/tests/privateFileService.test.ts`, `backend/tests/postgres/attachmentCore.integration.sql`, `mobile/tests/uploadContainment.test.ts`, `mobile/tests/privateFiles.test.ts`.
**Common symptoms:** signed URL persisted, attachment stuck pending, duplicate claim, outsider read.
**Usually do not read:** Avatar upload paths unless `resourceType=profile` is involved.

### Audio

**Purpose:** Record/upload audio as a canonical Attachment, enqueue transcription/analysis, preserve duration, and render playback.
**Canonical owner:** Attachment Core owns the file; `backend/src/services/audioTranscriptionWorker.service.ts` owns queued processing; `backend/src/services/transcription.service.ts` owns provider adaptation.
**Read first:**

- `mobile/src/hooks/useAudioRecorder.ts`
- `mobile/src/utils/audioRecording.ts`
- `backend/src/services/audioTranscriptionWorker.service.ts`
- `backend/src/services/transcription.service.ts`
- `mobile/src/components/AudioPlayer.tsx`

**Direct dependencies:** Attachments, private Storage, OpenAI transcription provider, message suggestion analysis.
**Used by:** Chat, shared content, Agent voice only at the transcription-provider layer.
**Tests:** `mobile/tests/audioRecording.test.ts`, `mobile/tests/expoAudioMigration.test.ts`, `backend/tests/audioTranscriptionWorker.test.ts`, `backend/tests/transcriptionProvider.test.ts`.
**Common symptoms:** Expo URI upload failure, wrong MIME, missing duration, transcription job stalled, invisible player.
**Usually do not read:** Agent voice session code for ordinary chat-audio failures.

### Retrieval

**Purpose:** Provide bounded, authorization-first canonical reads for people, commitments, proposals, events, messages, transcripts, attachments, and direct conversations.
**Canonical owner:** `backend/src/services/retrieval.service.ts` and shapes in `backend/src/types/retrieval.ts`.
**Read first:**

- `backend/src/services/retrieval.service.ts`
- `backend/src/types/retrieval.ts`
- `backend/src/utils/authz.ts`
- `backend/src/utils/commitmentVisibility.ts`

**Direct dependencies:** Supabase canonical tables, visibility filters, participant authorization, status semantics.
**Used by:** AgentContext, Agent planner, Memory, search-like evidence queries.
**Tests:** `backend/tests/retrievalService.test.ts`, `backend/tests/messageWindow.test.ts`, `backend/tests/postgres/fullTextRetrieval.integration.sql`.
**Common symptoms:** evidence leak, unbounded query, duplicate result, global recipient failure.
**Usually do not read:** Controllers; retrieval functions are callable directly and must be safe by default.

### Memory

**Purpose:** Store and retrieve evidence-linked facts while enforcing sensitivity, freshness, authorization, invalidation, and canonical-source dominance.
**Canonical owner:** `backend/src/services/memory.service.ts`; canonical conflicts are filtered by `backend/src/services/canonicalTruthRegistry.ts`.
**Read first:**

- `backend/src/services/memory.service.ts`
- `backend/src/services/canonicalTruthRegistry.ts`
- `backend/src/services/canonicalMemoryEvents.service.ts`
- `backend/src/types/memory.ts`

**Direct dependencies:** retrieval identity resolution, memory policy/provider, source evidence, Commitment events.
**Used by:** AgentContext and carefully bounded planning hints.
**Tests:** `backend/tests/memoryService.test.ts`, `backend/tests/agentContextBuilder.test.ts`.
**Common symptoms:** stale fact wins, restricted fact leaks, deleted source remains current, memory invents a date.
**Usually do not read:** Mobile storage; canonical memory is backend-owned.

## Agent domains

### AgentContext

**Purpose:** Turn interpreted read intent into authorized evidence and explicit ambiguity/freshness context for answer synthesis.
**Canonical owner:** `backend/src/services/agentContextBuilder.service.ts`.
**Read first:** `backend/src/services/agentContextBuilder.service.ts`, `backend/src/services/agentSession.service.ts`, `backend/src/types/agentContext.ts`, `backend/src/services/retrieval.service.ts`.

**Direct dependencies:** Retrieval, Memory, canonical truth registry, temporal/overdue semantics.
**Used by:** Agent read responses and `/agent/turn` read branch.
**Tests:** `backend/tests/agentContextBuilder.test.ts`, `backend/tests/temporalContext.test.ts`, `backend/tests/agentOrchestrator.test.ts`.
**Common symptoms:** wrong evidence window, ambiguous referent, UI/Agent overdue mismatch.
**Usually do not read:** Planner/executors for a purely read-only answer bug.

### Agent interpretation

**Purpose:** Extract deterministic intent/objective and hints, optionally use an LLM, and keep all model output non-authoritative.
**Canonical owner:** `backend/src/services/agentInputInterpreter.service.ts` for read/turn routing; `backend/src/services/agentObjectiveInterpreter.service.ts` for action objectives; `backend/src/services/agentInputEnvelope.service.ts` for trusted modality/provenance.
**Read first:** those three files plus `backend/src/schemas/agentInterpretation.schema.ts` or `backend/src/schemas/agentObjectiveInterpretation.schema.ts` only when payload validation fails.

**Direct dependencies:** deterministic patterns, optional OpenAI model, input envelope/session signals.
**Used by:** AgentTurn, Agent planning, voice input.
**Tests:** `backend/tests/agentInputInterpreter.test.ts`, `backend/tests/agentObjectiveInterpreter.test.ts`, `backend/tests/agentVoiceCapture.test.ts`.
**Common symptoms:** wrong intent, invented ID, prompt output accepted directly, voice provenance lost.
**Usually do not read:** Database writers; interpretation must not write.

### AgentTurn

**Purpose:** Provide one conversational entry point that deterministically returns a response, plan, clarification, or unsupported result without executing side effects.
**Canonical owner:** `runAgentTurn` in `backend/src/services/agentTurn.service.ts`.
**Read first:**

- `backend/src/services/agentTurn.service.ts`
- `backend/src/controllers/agentTurn.controller.ts`
- `backend/src/types/agentTurn.ts`
- `backend/src/services/agentInputInterpreter.service.ts`

**Direct dependencies:** Input envelope, AgentContext, response synthesis, planning orchestrator.
**Used by:** `POST /agent/turn`, Mobile Agent Preview.
**Tests:** `backend/tests/agentTurn.test.ts`, `mobile/tests/agentTurnUx.test.ts`.
**Common symptoms:** action answered as prose, read query becomes plan, clarification missing, accidental execution.
**Usually do not read:** `/agent/respond` legacy orchestration unless regression explicitly affects that endpoint.

### Agent planning

**Purpose:** Convert an action objective into grounded draft steps, validate them, and assign the final plan status.
**Canonical owner:** `runAgentPlanning` in `backend/src/services/agentPlanOrchestrator.service.ts` owns `draft`, `needs_clarification`, and `ready_for_authorization`. `planObjective` only owns `DraftOutcome` construction.
**Read first:**

- `backend/src/services/agentPlanOrchestrator.service.ts`
- `backend/src/services/agentPlanner.service.ts`
- `backend/src/types/agentPlan.ts`
- `backend/src/services/agentPlanValidator.service.ts`
- `backend/src/services/retrieval.service.ts`

**Direct dependencies:** Objective interpreter, Retrieval, ToolRegistry, date parsing, plan digest.
**Used by:** `/agent/plan`, `/agent/turn`, authorization re-derivation.
**Tests:** `backend/tests/agentPlanOrchestrator.test.ts`, `backend/tests/agentPlanner.test.ts`, `backend/tests/agentPlanEndToEnd.test.ts`.
**Common symptoms:** `missing_context`, wrong status, ungrounded step, recipient/conversation ambiguity.
**Usually do not read:** Mobile UI until the internal plan and Core presentation are correct.

### Plan validation

**Purpose:** Reject unknown tools/arguments/unsafe graph shapes and normalize steps against ToolRegistry contracts.
**Canonical owner:** `backend/src/services/agentPlanValidator.service.ts`.
**Read first:** `backend/src/services/agentPlanValidator.service.ts`, `backend/src/services/toolRegistry.service.ts`, `backend/src/types/agentPlan.ts`.

**Direct dependencies:** Tool argument schemas and plan limits.
**Used by:** `runAgentPlanning` before any plan is authorization-ready.
**Tests:** `backend/tests/agentPlanValidator.test.ts`, `backend/tests/toolRegistry.test.ts`.
**Common symptoms:** draft despite steps, validation issue, wrong confirmation/risk metadata.
**Usually do not read:** Tool executor implementation for structural validation failures.

### PlanPresentation

**Purpose:** Give Mobile truthful Core-authored titles, summaries, warnings, confirmation copy, and step descriptions.
**Canonical owner:** `buildPlanPresentation` and `buildStepPresentation` in `backend/src/services/agentTurn.service.ts`; contract in `backend/src/types/agentTurn.ts`.
**Read first:** those two files, then `mobile/src/components/agent/AgentPlanCard.tsx` for rendering only.

**Direct dependencies:** Final AgentPlan steps, risk, confirmation requirements, authorization TTL.
**Used by:** Mobile Agent plan and execution cards.
**Tests:** `backend/tests/agentTurn.test.ts`, `mobile/tests/agentTurnUx.test.ts`, `mobile/tests/agentPreview.test.ts`.
**Common symptoms:** misleading confirmation copy, mobile reconstructing semantics from `toolId`, wrong expiry message.
**Usually do not read:** LLM synthesizer; confirmation copy is deterministic Core output.

### ToolRegistry

**Purpose:** Declare allowed tools, versions, argument schemas, availability, side-effect class, authorization, and confirmation requirements.
**Canonical owner:** `backend/src/services/toolRegistry.service.ts`; executable mapping is `backend/src/services/toolExecutorRegistry.service.ts`.
**Read first:** those two files and `backend/src/types/agentPlan.ts`.

**Direct dependencies:** Zod schemas and concrete tool executors.
**Used by:** Planner, validator, authorization policy, execution.
**Tests:** `backend/tests/toolRegistry.test.ts`, `backend/tests/agentAuthorizationPolicy.test.ts`.
**Common symptoms:** unknown tool, tool planned but unavailable, confirmation policy mismatch.
**Usually do not read:** Every executor; open only the executor selected by the failing tool ID.

### Authorization

**Purpose:** Re-derive the plan, bind approval to its exact digest and actor, enforce policy/TTL, and support revocation.
**Canonical owner:** `backend/src/services/agentAuthorization.service.ts` plus policy in `backend/src/services/agentAuthorizationPolicy.service.ts`.
**Read first:** those files, `backend/src/services/agentPlanDigest.service.ts`, and `backend/src/controllers/agentAuthorize.controller.ts`.

**Direct dependencies:** `runAgentPlanning`, ToolRegistry policy, agent_authorizations RPC/data.
**Used by:** `POST /agent/authorize`, revoke endpoint, execution lookup.
**Tests:** `backend/tests/agentAuthorizationPolicy.test.ts`, `backend/tests/agentPlanDigest.test.ts`, `backend/tests/agentEndToEnd.test.ts`.
**Common symptoms:** digest mismatch, expired/revoked authorization, actor mismatch, stale plan.
**Usually do not read:** Mobile card styles or retrieval internals until plan re-derivation differs.

### Execution

**Purpose:** Atomically consume authorization, claim steps, invoke the registered executor, persist result, and make retries idempotent.
**Canonical owner:** `backend/src/services/agentExecution.service.ts` and `backend/src/services/toolExecutorRegistry.service.ts`.
**Read first:** those files, the one `backend/src/services/toolExecutors/*Executor.ts` matching the tool, and `backend/src/types/agentExecution.ts`.

**Direct dependencies:** authorization records, claim/complete RPCs, tool application boundaries.
**Used by:** `POST /agent/execute`, Mobile authorization-then-execute state.
**Tests:** `backend/tests/agentEndToEnd.test.ts`, `backend/tests/postgres/agentAuthorizationExecution.integration.sql`, `mobile/tests/agentTurnUx.test.ts`.
**Common symptoms:** replay, concurrent claim, partial execution, `needs_reauthorization`, false success.
**Usually do not read:** All tool executors; follow only the failing `toolId`.

### Verification / audit

**Purpose:** Report a side effect as successful only after the executor verifies canonical postconditions and stores traceable results.
**Canonical owner:** Tool executor outcome plus `backend/src/services/agentExecution.service.ts`; trace helpers live in `backend/src/utils/executionTrace.ts`.
**Read first:** execution service, failing executor, `backend/src/types/agentExecution.ts`, execution trace utility.

**Direct dependencies:** Canonical write/read boundary, execution-step records, created/updated entity refs.
**Used by:** AgentExecutionResult and Mobile `AgentExecutionCard`.
**Tests:** `backend/tests/agentEndToEnd.test.ts`, `backend/tests/securityContainment.test.ts`, PostgreSQL authorization/execution integration.
**Common symptoms:** `verified=false`, success copy without persisted effect, missing result ref.
**Usually do not read:** Plan interpretation when authorization and exact step are already known good.

### Voice

**Purpose:** Capture voice, transcribe it, preserve provenance/confidence, let the user edit text, then use the exact same AgentTurn/planning/authorization path.
**Canonical owner:** `backend/src/services/agentVoice.service.ts` for capture validation/token issuance; `backend/src/services/agentInputEnvelope.service.ts` for trusted handoff.
**Read first:**

- `mobile/src/hooks/useAgentVoiceInput.ts`
- `mobile/src/utils/voiceSession.ts`
- `backend/src/services/agentVoice.service.ts`
- `backend/src/services/agentInputEnvelope.service.ts`
- `backend/src/controllers/agentVoice.controller.ts`

**Direct dependencies:** Expo audio/file access, transcription provider, agent session/context signals.
**Used by:** AgentPreview; downstream behavior rejoins `/agent/turn`.
**Tests:** `backend/tests/agentVoicePipeline.test.ts`, `backend/tests/agentVoiceCapture.test.ts`, `mobile/tests/agentVoiceInput.test.ts`, `mobile/tests/agentVoiceTranscription.test.ts`.
**Common symptoms:** unsupported MIME, low-confidence action blocked, token expired, edited transcript ignored.
**Usually do not read:** A separate voice executor—none should exist; voice is an input modality, not authorization.

### Mobile Agent UX

**Purpose:** Render the conversation, Core plan presentation, explicit confirmation, progress, and verified execution without owning domain semantics.
**Canonical owner:** `mobile/src/screens/AgentPreviewScreen.tsx` coordinates UI; `mobile/src/utils/agentTurnState.ts` owns deterministic UI state.
**Read first:**

- `mobile/src/screens/AgentPreviewScreen.tsx`
- `mobile/src/utils/agentTurnState.ts`
- `mobile/src/api/query-modules/agent.ts`
- `mobile/src/components/agent/AgentPlanCard.tsx`
- `mobile/src/components/agent/AgentExecutionCard.tsx`

**Direct dependencies:** `/agent/turn`, `/agent/authorize`, `/agent/execute`, Core PlanPresentation, Agent voice hook.
**Used by:** `AgentPreview` route from the Conversations stack.
**Tests:** `mobile/tests/agentPreview.test.ts`, `mobile/tests/agentTurnUx.test.ts`, `mobile/tests/agentVoiceInput.test.ts`.
**Common symptoms:** confirm enabled twice, stale plan card, wrong retry state, local semantic routing.
**Usually do not read:** `mobile/src/screens/PingAIScreen.tsx`; it is a separate legacy surface.

### Staging / deployment

**Purpose:** Build only `backend/`, run the public health check, and guard the staging Supabase project identity.
**Canonical owner:** `render.staging.yaml` for versioned staging service configuration; runtime validation in `backend/src/config/env.ts` and health route in `backend/src/routes/index.ts`.
**Read first:** `render.staging.yaml`, `backend/src/config/env.ts`, `backend/src/routes/index.ts`, `docs/23-STAGING-BETA-VALIDATION.md`.

**Direct dependencies:** branch `codex/staging-beta`, service `ping-backend-staging`, expected Supabase ref `oonijgmddgyymhrlnvuu`.
**Used by:** Render auto-deploy and staging mobile configuration.
**Tests/checks:** `mobile/tests/stagingConfig.test.ts`, `backend/scripts/e2e-staging-beta.mjs`, `/api/health`.

**Common symptoms:** health old SHA, `db_status` disconnected, wrong project ref, accidental production target.
**Usually do not read:** `render.yaml` or local `.env` for a staging-only task unless comparing targets; never print secrets.
