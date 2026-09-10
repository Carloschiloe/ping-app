# Ping High-Value Dependency Map

Use this only after the Task Router and relevant Agent Index section. It maps architectural edges, not every import. For exhaustive direct local imports, use `docs/generated/import-index.json`.

## Agent conversational pipeline

```text
mobile/src/screens/AgentPreviewScreen.tsx
  → mobile/src/api/query-modules/agent.ts
  → POST /agent/turn
  → backend/src/controllers/agentTurn.controller.ts
  → backend/src/services/agentTurn.service.ts
      → backend/src/services/agentInputEnvelope.service.ts
      → backend/src/services/agentInputInterpreter.service.ts
      ├─ read intent
      │   → backend/src/services/agentContextBuilder.service.ts
      │   → backend/src/services/agentResponseSynthesizer.service.ts
      │   → AgentTurnResponse
      ├─ action intent
      │   → backend/src/services/agentPlanOrchestrator.service.ts
      │   → backend/src/services/agentPlanner.service.ts
      │   → identity/entity/conversation resolution
      │   → backend/src/services/agentPlanValidator.service.ts
      │   → AgentTurnPlan
      └─ ambiguity/unsupported
          → AgentTurnClarification / AgentTurnUnsupported
  → Core PlanPresentation
  → mobile/src/components/agent/AgentPlanCard.tsx
```

`/agent/turn` returns proposed state only. It never invokes an executor.

## Plan confirmation and execution

```text
mobile/src/components/agent/AgentPlanCard.tsx: Confirm
  → mobile/src/utils/agentTurnState.ts
  → mobile/src/api/query-modules/agent.ts
  → POST /agent/authorize
  → backend/src/controllers/agentAuthorize.controller.ts
  → backend/src/services/agentAuthorization.service.ts
      → re-run backend/src/services/agentPlanOrchestrator.service.ts
      → backend/src/services/agentPlanDigest.service.ts
      → backend/src/services/agentAuthorizationPolicy.service.ts
      → durable actor/plan/expiry binding
  → POST /agent/execute
  → backend/src/controllers/agentExecute.controller.ts
  → backend/src/services/agentExecution.service.ts
      → atomic authorization claim
      → atomic step claim
      → backend/src/services/toolExecutorRegistry.service.ts
      → one backend/src/services/toolExecutors/*Executor.ts
      → canonical Messaging/Commitment boundary
      → postcondition verification
      → persisted result
  → AgentExecutionResult
  → mobile/src/components/agent/AgentExecutionCard.tsx
```

Authorization binds the exact re-derived plan. Execution retries reuse durable idempotency state.

## People and identity

```text
user-authored hint
  → backend/src/services/agentInputInterpreter.service.ts
     OR backend/src/services/agentObjectiveInterpreter.service.ts
  → backend/src/services/retrieval.service.ts: resolvePerson
      → backend/src/utils/profileValidation.ts
      → backend/src/utils/authz.ts
      → profiles / owned contacts / shared conversation participants
  → zero candidates: not found clarification
  → multiple candidates: ambiguity clarification
  → exactly one: canonical RetrievalPerson
```

Contact discovery has a separate proof boundary:

```text
backend/src/controllers/user.controller.ts
  → backend/src/utils/contactDiscovery.ts
  → backend/src/controllers/conversation.controller.ts
  → backend/src/services/conversationApplication.service.ts
```

## Global recipient and DIRECT conversation resolution

```text
no currentConversationId + named recipient
  → resolvePerson(actor, hint)
  → canonical recipient id
  → resolveDirectConversation(actor, recipient)
      → actor's conversation_participants rows
      → active conversations filtered conversation_type=direct
      → complete participant set verified
      → exact set {actor, recipient}
         OR {actor} for self-chat
  → exactly one DIRECT: planner step arguments.conversationId
  → none or many: blocking conversation clarification
  → backend/src/services/agentPlanOrchestrator.service.ts
  → ready_for_authorization only after validation
```

Relevant tests: `backend/tests/retrievalService.test.ts`, `backend/tests/agentPlanner.test.ts`, `backend/tests/agentPlanOrchestrator.test.ts`.

## Conversations

```text
mobile/src/screens/ConversationsScreen.tsx / NewChatScreen.tsx / NewGroupScreen.tsx
  → mobile/src/api/query-modules/conversations.ts or groups.ts
  → backend/src/routes/index.ts
  → backend/src/controllers/conversation.controller.ts or group.controller.ts
  → backend/src/services/conversation.service.ts (compatibility helpers)
  → backend/src/services/conversationApplication.service.ts
  → create_conversation_with_participants / tombstone_conversation RPC
  → conversations + conversation_participants
```

Conversation-dependent reads/writes pass through `backend/src/utils/authz.ts`. Realtime presentation is reconciled in Mobile rather than treated as independent truth.

## Messaging

```text
mobile/src/screens/ChatScreen.tsx
  → mobile/src/hooks/useChatMessages.ts
      → mobile/src/api/query-modules/conversations.ts
      → mobile/src/utils/synchronization.ts
      → mobile/src/utils/messageReconciliation.ts
      → mobile/src/utils/messageReceipts.ts
  → POST /conversations/:id/messages
  → backend/src/controllers/conversation.controller.ts
  → backend/src/services/message.service.ts
  → backend/src/services/messagingApplication.service.ts
  → canonical message RPC / messages / receipts
  → Supabase Realtime
  → reconciliation into TanStack Query cache
```

Agent messages join at the same write boundary:

```text
send_message tool step
  → backend/src/services/toolExecutors/sendMessageExecutor.ts
  → assertConversationParticipant
  → backend/src/services/messagingApplication.service.ts: persistUserMessage
  → clientMessageId from execution idempotency key
  → persisted message re-read and verified
```

Tombstone:

```text
DELETE /messages/:id
  → backend/src/controllers/message.controller.ts
  → backend/src/services/messagingApplication.service.ts: tombstoneMessage
  → memory source invalidation
```

## Commitments and proposals

```text
HTTP routes / Agent tool executor / legacy adapter
  → backend/src/services/commitmentApplication.service.ts
      ├─ proposal commands
      │   → backend/src/services/commitmentProposal.service.ts
      │   → backend/src/utils/proposalParticipation.ts
      │   → proposal response/materialization RPCs
      └─ confirmed commitment commands
          → backend/src/services/commitment.service.ts
          → backend/src/utils/commitmentTransitions.ts
          → apply/edit/archive RPC with evidence
  → state + event + evidence/audit
  → backend/src/services/canonicalMemoryEvents.service.ts
```

Mobile current consumers:

```text
mobile/src/screens/TaskDashboardScreen.tsx (Hoy)
mobile/src/screens/InsightsScreen.tsx (Compromisos)
  → mobile/src/api/query-modules/commitments.ts
  → mobile/src/utils/commitmentConfirmDispatch.ts
  → explicit proposal or commitment endpoint
```

Do not route lifecycle status through generic PATCH. Do not collapse a pending proposal into an overdue commitment.

## Retrieval and memory

```text
Agent read interpretation
  → backend/src/services/agentContextBuilder.service.ts
      → backend/src/services/retrieval.service.ts
          → authorized people
          → visible commitments/proposals/events
          → participant-scoped messages/transcripts/attachments
      → backend/src/services/memory.service.ts
          → backend/src/services/memorySearchProvider.ts
          → evidence authorization revalidation
      → backend/src/services/canonicalTruthRegistry.ts
          → current canonical facts dominate stale memory
  → AgentContext with provenance/ambiguity/freshness
  → backend/src/services/agentResponseSynthesizer.service.ts
```

Memory ingestion:

```text
canonical source event
  → backend/src/services/canonicalMemoryEvents.service.ts
     OR backend/src/services/memory.service.ts: ingestMemoryFromEvent
  → backend/src/services/memoryAutoStorePolicy.ts
  → backend/src/services/memoryExtractionProvider.service.ts
  → evidence-linked memory
```

## Attachments and chat audio

```text
mobile/src/hooks/useMediaPicker.ts or useAudioRecorder.ts
  → POST /attachments/upload-intents
  → backend/src/controllers/attachment.controller.ts
  → backend/src/services/attachmentApplication.service.ts
  → signed upload from backend/src/services/privateFile.service.ts
  → real private Storage upload
  → POST /attachments/:id/complete
  → canonical attachment = uploaded
  → POST /conversations/:id/messages with attachmentId
  → Messaging RPC atomically claims attachment = attached
```

Read:

```text
message/shared-content item becomes visible or playable
  → mobile/src/hooks/useSharedContentUrl.ts or message presentation
  → POST /attachments/:id/read-url
  → Attachment authorization + membership
  → short-lived signed URL
  → never persisted by DB or Mobile durable state
```

Audio processing:

```text
attached audio
  → audio_transcription job
  → backend/src/services/audioTranscriptionWorker.service.ts
  → backend/src/services/transcription.service.ts
  → canonical transcript
  → analysis/suggestion pipeline when applicable
```

## Agent voice

```text
mobile/src/hooks/useAgentVoiceInput.ts
  → expo-audio capture + local file
  → mobile/src/api/query-modules/agent.ts
  → POST /agent/voice/transcribe
  → backend/src/controllers/agentVoice.controller.ts
  → backend/src/services/agentVoice.service.ts
      → transcription provider
      → agent session/context signals
      → backend/src/services/agentInputEnvelope.service.ts: signed voice token
  → editable transcript in AgentPreviewScreen
  → POST /agent/turn with voice token
  → same AgentTurn/planning/authorization/execution paths
```

Voice confidence can force review. Voice never authorizes or executes by itself.

## Mobile Agent UI

```text
mobile/src/navigation/index.tsx: AgentPreview route
  → mobile/src/screens/AgentPreviewScreen.tsx
      → mobile/src/hooks/useAgentVoiceInput.ts
      → mobile/src/api/query-modules/agent.ts
      → mobile/src/utils/agentChat.ts
      → mobile/src/utils/agentTurnState.ts
      ├─ response/clarification bubbles
      ├─ mobile/src/components/agent/AgentPlanCard.tsx
      └─ mobile/src/components/agent/AgentExecutionCard.tsx
```

The screen coordinates network and interaction state. It does not classify the user request, create plan copy, choose canonical IDs, or execute without explicit confirmation.

## High-value module index

| File / module | Role | Canonical truth owned | Directly depends on | Primary callers | Primary test |
|---|---|---|---|---|---|
| `backend/src/middleware/auth.ts` | Request authentication | Authenticated actor on request | Supabase Auth | Protected routes | `backend/tests/authz.test.ts` |
| `backend/src/utils/authz.ts` | Ownership/membership assertions | Authorization rules | Supabase tables | Core services/retrieval | `backend/tests/authz.test.ts` |
| `backend/src/services/conversationApplication.service.ts` | Conversation commands | Conversation creation/tombstone use cases | Conversation RPCs | Controllers/compat service | `backend/tests/conversationService.test.ts` |
| `backend/src/services/messagingApplication.service.ts` | Messaging commands | Message/receipt/tombstone writes | Messaging RPCs | Controllers/tool executor | `backend/tests/messageService.test.ts` |
| `backend/src/services/commitmentApplication.service.ts` | Commitment application boundary | Allowed Commitment use cases | Lifecycle/proposal delegates | Controller/tools | `backend/tests/commitmentCoreVertical.test.ts` |
| `backend/src/services/commitmentProposal.service.ts` | Proposal commands | Proposal responses/materialization | Proposal RPCs | Commitment boundary/tools | `backend/tests/commitmentProposalService.test.ts` |
| `backend/src/utils/commitmentTransitions.ts` | Pure lifecycle table | Valid transitions/events | Canonical statuses | Commitment service/planner | `backend/tests/commitmentTransitions.test.ts` |
| `backend/src/services/attachmentApplication.service.ts` | Attachment commands | Attachment lifecycle/authorization | Attachment RPCs/Storage | Attachment controller/message | `backend/tests/attachmentService.test.ts` |
| `backend/src/services/audioTranscriptionWorker.service.ts` | Background audio jobs | Job claim/process result | Storage/transcription | Backend startup/wakeup | `backend/tests/audioTranscriptionWorker.test.ts` |
| `backend/src/services/retrieval.service.ts` | Authorized canonical reads | Retrieval contracts and resolution | Authz/visibility/Supabase | Context/planner/memory | `backend/tests/retrievalService.test.ts` |
| `backend/src/services/memory.service.ts` | Memory lifecycle | Evidence-linked memory | Retrieval/policy/provider | Context/canonical events | `backend/tests/memoryService.test.ts` |
| `backend/src/services/agentContextBuilder.service.ts` | Read context assembly | Evidence/context selection | Retrieval/Memory | AgentTurn/orchestrator | `backend/tests/agentContextBuilder.test.ts` |
| `backend/src/services/agentInputInterpreter.service.ts` | Read/turn interpretation | Deterministic intent classification | Optional LLM/schema | AgentTurn | `backend/tests/agentInputInterpreter.test.ts` |
| `backend/src/services/agentObjectiveInterpreter.service.ts` | Action interpretation | Objective/hints | Optional LLM/schema | Planning | `backend/tests/agentObjectiveInterpreter.test.ts` |
| `backend/src/services/agentTurn.service.ts` | Unified conversational routing | Turn kind and PlanPresentation | Context/planning/synthesis | Turn controller | `backend/tests/agentTurn.test.ts` |
| `backend/src/services/agentPlanner.service.ts` | Draft step builder | DraftOutcome only | Retrieval/date/memory/tools | Plan orchestrator | `backend/tests/agentPlanner.test.ts` |
| `backend/src/services/agentPlanOrchestrator.service.ts` | Planning composition | Final AgentPlan status | Interpreter/planner/validator/digest | Plan/turn/authorization | `backend/tests/agentPlanOrchestrator.test.ts` |
| `backend/src/services/agentPlanValidator.service.ts` | Plan validation | Structural validity/corrections | ToolRegistry/plan types | Plan orchestrator | `backend/tests/agentPlanValidator.test.ts` |
| `backend/src/services/toolRegistry.service.ts` | Tool contracts | Tool schema/risk/auth/confirmation | Zod/plan types | Planner/validator/policy | `backend/tests/toolRegistry.test.ts` |
| `backend/src/services/agentAuthorization.service.ts` | Approval binding | Actor/digest/TTL authorization | Planning/policy/DB | Authorize controller/execution | `backend/tests/agentPlanDigest.test.ts` |
| `backend/src/services/agentExecution.service.ts` | Durable execution | Claim/replay/result state | Authorization/executors/RPCs | Execute controller | `backend/tests/agentEndToEnd.test.ts` |
| `mobile/src/screens/AgentPreviewScreen.tsx` | Agent UI coordinator | Ephemeral screen interaction | Agent API/state/cards/voice | Navigation | `mobile/tests/agentPreview.test.ts` |
| `mobile/src/utils/agentTurnState.ts` | Agent UI reducer | UI phase/pending plan state | Agent API types | AgentPreview | `mobile/tests/agentTurnUx.test.ts` |
| `mobile/src/screens/TaskDashboardScreen.tsx` | Current Hoy tab | Today presentation only | Commitment API/semantics | Main navigation | `mobile/tests/overdueUiAgentParity.test.ts` |

## Change-impact shortcuts

### Changing person resolution

**Read first:** `backend/src/services/retrieval.service.ts`, `backend/src/utils/authz.ts`, `backend/src/types/retrieval.ts`.

**Check after:** `backend/tests/retrievalService.test.ts`, `backend/tests/agentContextBuilder.test.ts`, `backend/tests/agentPlanner.test.ts`.

**Do not initialize:** AgentPreview, OpenAI, Messaging writers, or the full app merely to reproduce resolution.

### Changing conversation resolution

**Read first:** `backend/src/services/retrieval.service.ts`, `backend/src/services/conversationApplication.service.ts`, canonical conversation migration constraints only if schema behavior matters.

**Check after:** exact DIRECT participant set, self-chat cardinality, groups excluded, duplicates clarified, current conversation preserved.

**Do not initialize:** Mobile navigation or create a conversation as a resolution side effect.

### Changing AgentPlan status

**Canonical owner:** `runAgentPlanning` in `backend/src/services/agentPlanOrchestrator.service.ts`.

**Read first:** orchestrator, planner DraftOutcome contract, validator, plan types.

**Check after:** `backend/tests/agentPlanOrchestrator.test.ts`, planner focused tests, `/agent/turn` non-execution.

**Do not:** compute status inside `agentPlanner.service.ts` or Mobile.

### Changing confirmation copy

**Canonical owner:** Core `buildPlanPresentation`/`buildStepPresentation` in `backend/src/services/agentTurn.service.ts`.

**Read first:** AgentTurn service/types, then `mobile/src/components/agent/AgentPlanCard.tsx` only for rendering.

**Check after:** backend AgentTurn presentation assertions and mobile AgentTurn UX tests.

**Do not:** reconstruct copy, risk or recipient semantics from `toolId` in Mobile.

### Changing execution semantics

**Read first:** `backend/src/services/agentExecution.service.ts`, ToolRegistry, executor registry, and only the affected executor.

**Check after:** authorization expiry/revocation, concurrent claim, replay, postcondition verification, persisted audit/result.

**Do not:** call an executor from `/agent/turn` or `/agent/plan`.

### Changing voice

**Read first:** `mobile/src/hooks/useAgentVoiceInput.ts`, `backend/src/services/agentVoice.service.ts`, input envelope, transcription provider.

**Check after:** real MIME/size/duration, confidence, editable text, token binding, same AgentTurn and explicit authorization.

**Do not:** add a voice-only planner, executor, or authorization path.

### Changing commitment lifecycle

**Read first:** `backend/src/services/commitmentApplication.service.ts`, transition table/status utilities, proposal participation when proposals are involved.

**Check after:** state + event + evidence atomicity, owner/participant permissions, proposal-vs-commitment semantics, Mobile parity.

**Do not:** mutate lifecycle through generic PATCH or add direct table writers.

### Changing attachments or audio

**Read first:** Attachment application service, private file service, relevant Mobile upload hook; add worker/transcription only for audio processing.

**Check after:** signed URLs never persisted, lifecycle transition, membership revocation, retry/idempotency, tombstone behavior.

**Do not:** reintroduce public URLs or `[audio]URL` message encoding.

### Changing staging/deployment

**Read first:** `render.staging.yaml`, `backend/src/config/env.ts`, health route, current explicit authorization.

**Check after:** branch, runtime SHA, `ok=true`, `db_status=connected`, expected Supabase ref.

**Do not:** infer production authorization from a staging request or reveal environment values.
