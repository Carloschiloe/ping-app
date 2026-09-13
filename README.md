# PING

Ping is a global, horizontal, domain-agnostic conversational AI agent built around real messaging, commitments, people, memory, context, planning, authorization, and verified execution.

Its product promise is simple: **Ping remembers what matters and helps the user follow through.** Mobile is the current primary surface. The same Ping Core is intended to serve Web/PC, tablet, voice, a dedicated Ping device, and car experiences without creating a second agent or a second source of truth.

## Agent: start here

For most coding tasks, do this and stop as soon as you have enough context:

1. Read this README.
2. Find the task or error keywords in [`docs/AGENT_TASK_ROUTER.md`](docs/AGENT_TASK_ROUTER.md).
3. Read only the matching domain section in [`docs/AGENT_INDEX.md`](docs/AGENT_INDEX.md).
4. Inspect the 2–6 listed entry points and the focused test first.
5. Use [`docs/DEPENDENCY_MAP.md`](docs/DEPENDENCY_MAP.md) only for cross-module impact.
6. Use [`docs/generated/import-index.json`](docs/generated/import-index.json) only for direct import/imported-by questions.

Broad repository search is a fallback, not the starting point.

## Repo guard

- Repository: `Carloschiloe/ping-app`
- Integration branch: `codex/staging-beta`
- Typical Windows root: `C:\Users\carlo\Desktop\App en produccion\Ping`
- Shell on the current workstation: Windows PowerShell 5.1

Before changing anything, verify the root, remote, branch, HEAD, and dirty worktree. Never reset, clean, restore, stage, or overwrite unrelated user work.

## Critical invariants

- **LLM suggests; Ping Core decides.** Model output is an untrusted hint.
- Messaging remains canonical real messaging; Agent features do not replace Chat.
- `AgentPlan` is not authorization.
- Voice input is not authorization.
- No side effect happens before explicit authorization when the tool contract requires it.
- Core owns actor identity, permissions, canonical IDs, lifecycle truth, and writes.
- Person names are hints; Core resolves canonical people and authorized resources.
- Mobile renders Core `PlanPresentation`; it must not reconstruct semantics from `toolId`.
- Commitment proposals and commitments are distinct lifecycle concepts.
- A pending proposal is never overdue and is not yet a commitment.
- The app has exactly four primary tabs: **Chats | Hoy | Compromisos | Perfil**.
- Preserve source messages, transcripts, evidence, provenance, audit, and idempotency.
- Production is never touched without explicit, current authorization.

## Current state

Milestones documented:

- Global recipient resolution fix: `19f5fd8e692d4fa25402f3d5cc1b39bd0d1d8fb9`
- Agent navigation system introduced in: `38e3f2c1fd0e122fd679f8f84560e2c6e2684681`
- M-6 physical iPhone certification staging commit: `930eca0`
- M-3/M-4 physical iPhone certification staging commit: `02d4aa4`
- Media deletion UX physical iPhone certification staging commit: `0e6ba75`

- **M-1 — Retrieval and context:** authorization-aware structured retrieval, identity resolution, context building, and evidence-backed agent responses.
- **M-2 — Memory:** evidence-linked memory ingestion/retrieval with sensitivity, freshness, invalidation, and canonical-fact dominance. Historical lifecycle query semantics PHYSICALLY CERTIFIED ON IPHONE (staging commit `9a46210`). Historical transition absence / cross-lifecycle contamination — the follow-on gap found in that same physical session — is now also PHYSICALLY CERTIFIED ON IPHONE, CLOSED (staging commit `fd98849`); see below.
- **M-3 — Planning:** objective interpretation, deterministic resolution, `AgentPlan`, validation, digest, and clarification/authorization-ready states. PHYSICALLY CERTIFIED ON IPHONE.
- **M-4 — Authorization and execution:** exact-plan binding, expiring/revocable authorizations, idempotent step claiming, tool executors, verification, and audit records. CORE WRITE FLOW PHYSICALLY CERTIFIED ON IPHONE (send_message, create_commitment). Replay/idempotency/exact-plan digest binding/actor binding CERTIFIED AT THE API/CORE LEVEL against a real local Postgres integration.
- **M-5 — Voice:** real mobile capture/transcription and editable transcript feeding the same Agent pipeline. Physical iPhone voice certification passed.
- **M-6 — Conversational Agent UX:** unified `/agent/turn`, Core-owned presentation, mobile plan confirmation, authorization, execution, and truthful result cards — DEPLOYED TO STAGING AND PHYSICALLY CERTIFIED ON IPHONE.

The global named-recipient fix (commit `19f5fd8e`) is deployed: one canonical person plus one authorized exact DIRECT conversation can become a `send_message` plan without a current chat context. M-6 physical certification (staging commit `930eca0`): global Agent Preview send_message reached PlanCard confirmation, authorize → execute → verify completed, and exactly one real message was delivered; the voice recorder lifecycle retest (record → background → return) also passed with no crash and no zombie microphone. Android voice remains future/non-blocking. M-3/M-4 physical certification (staging commit `02d4aa4`): the core write flow was verified end-to-end for both `send_message` (PlanCard showed recipient Alejandra and payload "llegaré tarde"; one confirmation triggered authorize → execute → verify; exactly one real message appeared in her chat) and `create_commitment` (PlanCard showed title "entrenar" for mañana 08:00; one confirmation triggered authorize → execute → verify; Compromisos count went from 6 to 7 with exactly one new "entrenar" entry). M-4 API/Core certification (local real Postgres, disposable loopback instance, no mocks for authorization/execution persistence): same-authorization replay confirmed idempotent (first execute +1 canonical row, replay reports `idempotentReplay: true` with the row count unchanged); exact-plan digest binding rejects a mismatched digest for content, recipient, conversationId, date/time, and tool changes alike, with zero mutation; actor binding rejects a different actor with zero mutation; consumed/expired/revoked authorization behavior and exactly-once DB constraints (including concurrency races) hold; verification truthfulness confirmed. This is API/Core contract certification — distinct from the M-4 physical certification above, and not a claim that every M-4 executor/tool has been independently real-DB certified. Production is untouched.

**M-2 historical lifecycle query semantics (staging commit `9a46210`) — HISTORICAL QUERY ROUTING PHYSICALLY CERTIFIED ON IPHONE.** Two focused historical lifecycle questions were verified end-to-end against real staging data: (1) "Cuando completamos lo de Spiderman?" — visible answer "Completamos el compromiso 'Ver Spiderman' el 10 de septiembre de 2026 a las 22:33. El compromiso 'Ver Spiderman' está actualmente resuelto." (2 fuentes) — verified the historical query correctly resolved to a focused lookup, targeted the correct canonical commitment ("Ver Spiderman"), preserved the actor-local completion occurrence time, allowed current canonical state to enrich only that same entity, and never mentioned the unrelated, separately-retrieved "Spiderman el Viernes" (cancelled) commitment; no generic fallback was shown. (2) "Cuando cancelamos lo de entrenar?" — visible answer "Cancelamos el compromiso 'entrenar' el 11 de septiembre de 2026 a las 11:43. El compromiso 'entrenar' está actualmente cancelado." (2 fuentes) — verified the correct canonical commitment ("entrenar"), the correct transition (cancellation), the correct occurrence time (never substituted by `due_at`), and the correct current canonical state, with no unrelated lifecycle history in the answer. Both certifications depend on the chain landed in commits `6d242f0` (canonical dominance now follows structured evidence lineage — commitment/commitment_event/commitment_status-memory → commitmentId — instead of lexical title matching), `4cefd61` (historical lifecycle lookup scope is now a Core-owned deterministic signal, separate from whichever domain label an LLM assigns to `intent`), and `9a46210` (that signal requires actual question form — "cuándo/when" + verb — so a declarative lifecycle sentence never manufactures a focused lookup). Together they represent, in the running implementation: LLM suggests, Core decides; intent domain and query cardinality are distinct concepts; explicit list/exhaustive requests still win over a lifecycle verb; canonical dominance never lets lexical matching override known structured lineage; and historical event occurrence time is distinct from `due_at`.

**M-2 — Historical transition absence / cross-lifecycle contamination (staging commit `fd98849`) — CLOSED, PHYSICALLY CERTIFIED ON IPHONE.** Originally found open during the `9a46210` physical session (the query "Cuando completamos lo de entrenar?" — a *different* transition than the one certified above for the same commitment — narrated unrelated lifecycle facts, cancelled/rejected/confirmed/accepted, instead of representing that no completion event exists). Root-caused and fixed across three staged commits, then physically re-certified end-to-end on iPhone against the same real data (canonical commitment "entrenar" — `9e39edeb-d7b0-467d-9073-f0848251c7d3` — cancelled, with a distinct homonym proposal "Entrenar" — `0d718396-bab7-424a-834f-24ab19630f8b` — rejected):

- (1) **Absent requested transition — PHYSICAL PASS.** "Cuando completamos lo de entrenar?" → *"Encontré el compromiso 'entrenar', pero no encuentro evidencia de que se haya producido esa transición."* (1 fuente). Confirms: canonical entity resolved correctly; the requested completion transition is absent from canonical evidence; Core represents that absence explicitly rather than substituting a different true fact; the commitment's own cancellation is not narrated as if it answered "when did we complete it"; the homonym proposal's rejection is excluded entirely; no accepted/confirmed lifecycle event is substituted either.
- (2) **Positive cancellation — PHYSICAL PASS (regression-preserved).** "Cuando cancelamos lo de entrenar?" → cancellation 11 Sep 2026 11:43 local, current canonical state cancelled, 2 fuentes.
- (3) **Positive completion, cross-entity disambiguation — PHYSICAL PASS (regression-preserved).** "Cuando completamos lo de ver Spiderman?" → completion 10 Sep 2026 22:33 local, current canonical state resolved, 2 fuentes, unrelated "Spiderman el Viernes" excluded.

Together these three physical results certify, in the running implementation: canonical target resolution happens deterministically in context building (`agentContextBuilder.service.ts#resolveRequestedTransitionTarget`), strictly before any LLM synthesis call, never reconstructed from what the model chooses to cite (LLM suggests, Core decides — entity resolution is never indirectly delegated to the model); the requested transition is verified structurally against canonical `commitment_event`/`commitment_status`-memory evidence for that exact resolved entity (`agentResponseSynthesizer.service.ts#enforceRequestedTransitionEvidence`); absence of matching evidence is a first-class, Core-enforced truthful outcome — never inferred voluntarily by the LLM, and never satisfied by a true-but-non-responsive fact (a current-status claim, a different transition, a homonym entity) standing in as the answer; a `commitment_proposal` can never satisfy or disable verification of a `commitment`'s requested transition (proposal ≠ commitment is preserved through this entire path); historical occurrence time is always the actor-local timestamp of the real canonical event, never `due_at`; and current canonical state may only enrich the single correctly linked entity, never a lexically similar but structurally distinct one. Implementation landed across commits `56533f3`, `4d9d81f`, `81be76a` (requested-transition table, propagation, tri-state memory agreement), `c47ffdc` (lineage-based multi-entity target resolution — since superseded), `3080c13` (deterministic target resolution moved into context building, before synthesis), and `fd98849` (absence enforcement made symmetric per-target-claim, closing the final physical gap where a true current-status claim could survive as a non-responsive substitute answer). Full backend (1440/1440) and mobile (705/705) suites pass; `tsc --noEmit` clean on both. Production untouched throughout.

**Media deletion UX (staging commit `0e6ba75`) — MEDIA DELETION UX PHYSICALLY CERTIFIED ON IPHONE.** Scope: canonical message tombstone (`deleted_at`), attachment read disabled after tombstone, compact deleted-message presentation, persistence after chat reload, and Shared Media exclusion — both photo and video physically exercised. Photo: sent a new photo, deleted it, observed the compact "Mensaje eliminado" tombstone (no large empty media square, no thumbnail/player, no "Recuperando archivo..." spinner), left the chat and re-entered with the compact tombstone unchanged, and confirmed the deleted photo no longer appears in Fotos y videos / Shared Media. Video: identical sequence and identical result. This certifies presentation and access-control behavior only; current retention policy intentionally does not hard-delete the underlying Storage object, and no claim of physical Storage-object deletion is made.

Backend regression at this state: **1127 passing**. Published M-6 mobile baseline: **564 passing**.

## Repository shape

- `backend/src/` — Express API, Ping Core application services, agent pipeline, authorization, execution, workers.
- `backend/tests/` — focused Vitest suites and PostgreSQL integration specifications.
- `mobile/src/` — Expo/React Native screens, API modules, state, hooks, and presentation.
- `mobile/tests/` — focused mobile contract and state tests.
- `supabase/migrations/` — canonical database evolution; migrations outrank historical scripts.
- `docs/` — product intent, architecture, domain routing, runbooks, and validation records.
- `scripts/` — repository-level deterministic tooling.

## Quickstart

Requirements: Node.js compatible with the package engines, npm, and local environment files derived from the checked-in examples. Never print or commit `.env` contents.

Backend:

```powershell
Set-Location backend
npm install
npm run dev
```

Mobile in another terminal:

```powershell
Set-Location mobile
npm install
npm start
```

For a physical device, the configured API URL must be reachable from that device. Use the existing staging configuration when reviewing staging; do not silently redirect production configuration.

## Development rules

Use the smallest validation ladder proportional to the change:

1. Run the focused test that owns the behavior.
2. Run the affected module suite.
3. Run TypeScript/build checks.
4. Run the full regression only at closure or when explicitly required.

Additional rules:

- Diagnose the exact expected/received failure before editing.
- Do not rerun the same failing command blindly.
- Do not start with a broad grep or read every service/test.
- Prefer canonical application services over controllers or compatibility adapters.
- Never add direct Commitment writers outside `commitmentApplication.service.ts` and its canonical delegates.
- Preserve legacy routes as adapters until an authorized migration removes them.
- On PowerShell 5.1, do not use Bash-only `&&`, `head`, `tail`, or `ls -la`.
- Do not deploy, push, migrate remotely, or change infrastructure without explicit authorization.
- Never expose service-role keys, signed URLs, tokens, credentials, or `.env` contents.

## Documentation links

- Fast task lookup: [`docs/AGENT_TASK_ROUTER.md`](docs/AGENT_TASK_ROUTER.md)
- Domain handbook: [`docs/AGENT_INDEX.md`](docs/AGENT_INDEX.md)
- Durable architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- High-value graphs and change impact: [`docs/DEPENDENCY_MAP.md`](docs/DEPENDENCY_MAP.md)
- Generated direct-import graph: [`docs/generated/import-index.json`](docs/generated/import-index.json)
- Product vision: [`docs/00-VISION-PING.md`](docs/00-VISION-PING.md)
- Architecture principles: [`docs/20-ADR-INDEX-ARCHITECTURE-PRINCIPLES.md`](docs/20-ADR-INDEX-ARCHITECTURE-PRINCIPLES.md)
- Technical audit: [`docs/21-TECHNICAL-ARCHITECTURE-AUDIT.md`](docs/21-TECHNICAL-ARCHITECTURE-AUDIT.md)
- Staging runbook: [`docs/23-STAGING-BETA-VALIDATION.md`](docs/23-STAGING-BETA-VALIDATION.md)

When documentation and implementation differ, treat source plus `supabase/migrations/` as the current technical truth, then report the contradiction instead of silently choosing one.
