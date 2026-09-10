# Ping Architecture

This document describes durable boundaries and invariants. It is not a release diary.

## Product shape

Ping is one conversational product with several interfaces over one Core. Messaging remains a first-class product surface. Voice, Web/PC, tablet, a Ping device, and car integrations must reuse the same identities, context, plans, permissions, writes, and evidence.

The product loop is:

`natural capture → detection → proposal → explicit confirmation → commitment → follow-up → resolution`

A suggestion is not a commitment. A plan is not authorization. A transcript is not authorization.

## Ping Core

Ping Core is a set of explicit domain boundaries:

- **Conversation:** DIRECT/self/group identity, membership, lifecycle.
- **Messaging:** canonical messages, receipts, ordering, idempotency, tombstones.
- **Commitment:** confirmed work, permitted edits, lifecycle transitions, resolution.
- **People:** actors, canonical users, owned contacts, deterministic resolution.
- **Attachments:** private objects, upload lifecycle, claims, read authorization.
- **Audio:** Attachment-backed recordings, duration, transcription and analysis jobs.
- **Memory / Retrieval:** authorized evidence, bounded search, freshness and provenance.
- **AI / Agent:** interpretation, context, planning, presentation and truthful response.
- **Tools:** declared capabilities, argument schemas, risk, confirmation and executors.
- **Context:** conversation/session/referent/time signals; never implicit global authority.
- **Authorization:** actor-bound, exact-plan, expiring and revocable approval.
- **Events / audit:** state changes paired with evidence, provenance and execution records.

Controllers and mobile screens are delivery adapters. They do not own canonical truth.

## North Star pipeline

```text
User
  → deterministic semantic extraction
  → optional LLM hints
  → Core normalization and invariants
  → canonical query or plan
  → authorization-aware retrieval OR explicit authorization
  → canonical facts or execution
  → postcondition verification
  → truthful response
```

Every surface should converge on this pipeline. Adding a surface must not add a parallel writer, identity system, planner, or lifecycle.

## Canonical principles

### LLM suggests; Ping Core decides

An LLM may classify intent, propose person/entity/time hints, or synthesize prose from approved evidence. It may not invent or authorize a canonical ID, bypass membership, select lifecycle transitions, or directly persist a side effect.

Deterministic code and canonical data decide:

- actor and recipient identity;
- visible resources and participant permissions;
- status/lifecycle validity;
- tool availability and argument validity;
- authorization and execution eligibility;
- verified result truth.

### Identity

```text
user text / transcript
  → name, email, phone or entity hint
  → deterministic canonical resolution
  → zero, one or many authorized candidates
  → exact ID OR clarification
```

Client-provided and model-provided IDs remain untrusted until ownership or membership is verified.

For global `send_message`:

```text
named person
  → canonical person resolution
  → actor memberships
  → active conversations filtered to DIRECT
  → exact participant set (actor + recipient, or actor alone for self)
  → exactly one conversation OR clarification
```

The resolver never creates a conversation and never picks the first match.

### Retrieval and memory

Retrieval is authorization-first and bounded. It returns canonical evidence plus provenance, not raw unrestricted rows. AgentContext consumes these safe primitives.

Memory is derived knowledge, not a stronger truth source than the entity that produced it. It must retain source evidence, sensitivity, confidence and freshness. Deletion, revoked visibility, or superseding canonical facts invalidate or suppress memory.

### Planning

```text
objective
  → person/entity/time resolution
  → planner DraftOutcome
  → AgentPlan validation
  → draft | needs_clarification | ready_for_authorization
```

The sole status owner is `runAgentPlanning` in `backend/src/services/agentPlanOrchestrator.service.ts`. Planner helpers build `DraftOutcome`; they must not duplicate final status computation.

An `AgentPlan` describes proposed operations, exact arguments, dependencies, provenance, risk and confirmation requirements. `ready_for_authorization` means structurally eligible for explicit authorization, not executed.

### Plan presentation

Core derives `PlanPresentation` from the final plan. Mobile renders it. Mobile must not infer confirmation language, recipients, effects, risk, or execution meaning from `toolId`.

### Authorization and execution

```text
AgentPlan
  → deterministic digest
  → user sees Core PlanPresentation
  → explicit authorization binds actor + exact re-derived plan + expiry
  → authorization atomically consumed
  → each step atomically claimed
  → registered executor invokes canonical application boundary
  → postcondition verified
  → result/audit persisted
  → truthful AgentExecutionResult
```

Key properties:

- Plan is not authorization.
- Authorization is not execution.
- Authorization cannot approve a changed plan.
- Execution verifies current live state and permission.
- Idempotency makes retries safe; a concurrent claimant does not duplicate work.
- Partial/waiting/blocked results remain explicit.
- Success requires verified canonical evidence.

### Tools

ToolRegistry is the allowlist. A tool contract owns version, schema, availability, side-effect class, authorization, and confirmation policy. The executor registry maps only executable tools to concrete executors. Executors call canonical Messaging or Commitment boundaries; they do not create alternate persistence paths.

### Voice

```text
audio capture
  → validated format/size/duration
  → transcript + confidence + provenance
  → editable text
  → same AgentTurn
  → same planning
  → same explicit M-4 authorization
  → same execution and verification
```

Voice is an input modality. A voice token preserves trusted capture provenance; it does not grant action authority. Low-confidence action text must stop for review.

Chat audio is separate at capture time: it is a canonical Attachment that can be transcribed by the background worker. It still must not create a parallel message or commitment writer.

### Commitments and proposals

```text
Proposal
  → waiting for required responses
  → fully approved
  → atomically materialized Commitment
  → active lifecycle
  → overdue attention OR completed/cancelled
```

A pending proposal cannot be overdue because it is not an active commitment. Generic PATCH changes only permitted fields; lifecycle changes use explicit commands. Important transitions write state, event and required evidence atomically. Archival is recoverable. Original message/proposal provenance remains intact.

### Conversations, messages and attachments

Conversation membership is checked before reading or writing dependent resources. DIRECT means one self participant or exactly two participants; group membership must never substitute for a DIRECT recipient channel.

Messages use client idempotency, canonical receipt operations, tombstones and Realtime reconciliation. Attachments use `pending → uploaded → attached → tombstoned`, issue short-lived signed URLs only after authorization, and never persist those URLs or signing tokens.

### Events and observability

Domain events and execution records establish what happened. Trace logs explain a request without leaking message bodies, secrets, signed URLs or credentials. Logs are diagnostic context, not canonical business evidence.

## Delivery boundaries

### Backend

`backend/src/routes/index.ts` authenticates and validates delivery requests. Controllers translate HTTP shapes. Application services own use cases. Utilities encode pure status/transition/authorization rules. Supabase migrations and RPCs own atomic database invariants.

### Mobile

Mobile owns interaction and presentation state. TanStack Query coordinates server cache; Supabase Realtime triggers reconciliation. The four primary tabs are `Chats | Hoy | Compromisos | Perfil`. Mobile does not hold service-role credentials or canonical lifecycle authority.

### Database

`supabase/migrations/` is the schema source of truth. Historical scripts do not override canonical migrations. Remote migrations require explicit environment authorization and identity verification.

## M-1 through M-6

- **M-1:** Built authorization-aware structured/full-text retrieval, deterministic interpretation, AgentContext, response synthesis, read-only orchestration, and initial Mobile Agent Preview. Evidence and ambiguity are explicit.
- **M-2:** Added evidence-linked memory with safe ingestion, sensitivity, freshness, invalidation and canonical dominance. Memory informs but never silently overrules current facts.
- **M-3:** Added objective interpretation, deterministic planner steps, ToolRegistry-aware validation, plan status and digest. Planning remains side-effect free. PHYSICALLY CERTIFIED ON IPHONE (staging commit `02d4aa4`).
- **M-4:** Added exact-plan authorization, policy, expiry/revocation, atomic/idempotent execution, tool executors, verification and audit results. CORE WRITE FLOW PHYSICALLY CERTIFIED ON IPHONE (staging commit `02d4aa4`): send_message and create_commitment each verified end-to-end (no write before explicit confirmation, one confirmation → authorize → execute → verify, truthful terminal result, canonical state matches). M-4 API/CORE CERTIFICATION (replay/idempotency/exact-plan digest binding/actor binding) separately certified against a real local Postgres integration — never mocked authorization/execution persistence or canonical writes: same-authorization replay is idempotent (zero additional rows, `idempotentReplay: true`); a mismatched digest (content, recipient, conversationId, date/time, or tool) is rejected before mutation; a different actor is rejected before mutation; consumed/expired/revoked behavior and exactly-once DB constraints (including concurrency races) hold; verification truthfulness confirmed. This does not claim every executor/tool has been independently real-DB certified.
- **M-5:** Added agent voice capture/transcription/provenance and editable transcript reuse of AgentTurn. Physical iPhone voice capture passed.
- **M-6:** Unified conversational response/plan/clarification routing and Core presentation with Mobile confirmation/execution UX. Global recipient-to-DIRECT resolution is deployed. DEPLOYED TO STAGING AND PHYSICALLY CERTIFIED ON IPHONE (staging commit `930eca0`); Android voice remains future/non-blocking. Production is untouched.

## Change rule

When a proposed feature appears to require a new route around Core, first identify which existing boundary should own it. Extend a canonical contract only when needed; preserve legacy callers as adapters. Never trade explicit authorization, provenance, or verified truth for convenience.
