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
- **M-4 — Authorization and execution:** exact-plan binding, expiring/revocable authorizations, idempotent step claiming, tool executors, verification, and audit records. ALL 5 CURRENT AGENT WRITE TOOLS PHYSICALLY CERTIFIED ON IPHONE: send_message, create_commitment, reschedule_commitment (staging commit `ca18aa5`), respond_to_proposal/counter-propose, and complete_commitment (see below for both). Replay/idempotency/exact-plan digest binding/actor binding CERTIFIED AT THE API/CORE LEVEL against a real local Postgres integration.
- **M-5 — Voice:** real mobile capture/transcription and editable transcript feeding the same Agent pipeline. Physical iPhone voice certification passed.
- **M-6 — Conversational Agent UX:** unified `/agent/turn`, Core-owned presentation, mobile plan confirmation, authorization, execution, and truthful result cards — DEPLOYED TO STAGING AND PHYSICALLY CERTIFIED ON IPHONE.
- **M-7 — Natural Conversational Intelligence (IN PROGRESS, NOT YET PHYSICALLY CERTIFIED ON IPHONE):** cross-turn dialogue state and read-side referent continuity. See below for exact scope and what remains open.
- **M-8 — Genuine user-requested memory (IN PROGRESS, NOT YET PHYSICALLY CERTIFIED ON IPHONE):** `remember_fact`, the sixth Agent write tool and the first outside the commitment/messaging domain. See below for scope and rationale.

The global named-recipient fix (commit `19f5fd8e`) is deployed: one canonical person plus one authorized exact DIRECT conversation can become a `send_message` plan without a current chat context. M-6 physical certification (staging commit `930eca0`): global Agent Preview send_message reached PlanCard confirmation, authorize → execute → verify completed, and exactly one real message was delivered; the voice recorder lifecycle retest (record → background → return) also passed with no crash and no zombie microphone. Android voice remains future/non-blocking. M-3/M-4 physical certification (staging commit `02d4aa4`): the core write flow was verified end-to-end for both `send_message` (PlanCard showed recipient Alejandra and payload "llegaré tarde"; one confirmation triggered authorize → execute → verify; exactly one real message appeared in her chat) and `create_commitment` (PlanCard showed title "entrenar" for mañana 08:00; one confirmation triggered authorize → execute → verify; Compromisos count went from 6 to 7 with exactly one new "entrenar" entry). M-4 API/Core certification (local real Postgres, disposable loopback instance, no mocks for authorization/execution persistence): same-authorization replay confirmed idempotent (first execute +1 canonical row, replay reports `idempotentReplay: true` with the row count unchanged); exact-plan digest binding rejects a mismatched digest for content, recipient, conversationId, date/time, and tool changes alike, with zero mutation; actor binding rejects a different actor with zero mutation; consumed/expired/revoked authorization behavior and exactly-once DB constraints (including concurrency races) hold; verification truthfulness confirmed. This is API/Core contract certification — distinct from the M-4 physical certification above, and not a claim that every M-4 executor/tool has been independently real-DB certified. Production is untouched.

**M-2 historical lifecycle query semantics (staging commit `9a46210`) — HISTORICAL QUERY ROUTING PHYSICALLY CERTIFIED ON IPHONE.** Two focused historical lifecycle questions were verified end-to-end against real staging data: (1) "Cuando completamos lo de Spiderman?" — visible answer "Completamos el compromiso 'Ver Spiderman' el 10 de septiembre de 2026 a las 22:33. El compromiso 'Ver Spiderman' está actualmente resuelto." (2 fuentes) — verified the historical query correctly resolved to a focused lookup, targeted the correct canonical commitment ("Ver Spiderman"), preserved the actor-local completion occurrence time, allowed current canonical state to enrich only that same entity, and never mentioned the unrelated, separately-retrieved "Spiderman el Viernes" (cancelled) commitment; no generic fallback was shown. (2) "Cuando cancelamos lo de entrenar?" — visible answer "Cancelamos el compromiso 'entrenar' el 11 de septiembre de 2026 a las 11:43. El compromiso 'entrenar' está actualmente cancelado." (2 fuentes) — verified the correct canonical commitment ("entrenar"), the correct transition (cancellation), the correct occurrence time (never substituted by `due_at`), and the correct current canonical state, with no unrelated lifecycle history in the answer. Both certifications depend on the chain landed in commits `6d242f0` (canonical dominance now follows structured evidence lineage — commitment/commitment_event/commitment_status-memory → commitmentId — instead of lexical title matching), `4cefd61` (historical lifecycle lookup scope is now a Core-owned deterministic signal, separate from whichever domain label an LLM assigns to `intent`), and `9a46210` (that signal requires actual question form — "cuándo/when" + verb — so a declarative lifecycle sentence never manufactures a focused lookup). Together they represent, in the running implementation: LLM suggests, Core decides; intent domain and query cardinality are distinct concepts; explicit list/exhaustive requests still win over a lifecycle verb; canonical dominance never lets lexical matching override known structured lineage; and historical event occurrence time is distinct from `due_at`.

**M-2 — Historical transition absence / cross-lifecycle contamination (staging commit `fd98849`) — CLOSED, PHYSICALLY CERTIFIED ON IPHONE.** Originally found open during the `9a46210` physical session (the query "Cuando completamos lo de entrenar?" — a *different* transition than the one certified above for the same commitment — narrated unrelated lifecycle facts, cancelled/rejected/confirmed/accepted, instead of representing that no completion event exists). Root-caused and fixed across three staged commits, then physically re-certified end-to-end on iPhone against the same real data (canonical commitment "entrenar" — `9e39edeb-d7b0-467d-9073-f0848251c7d3` — cancelled, with a distinct homonym proposal "Entrenar" — `0d718396-bab7-424a-834f-24ab19630f8b` — rejected):

- (1) **Absent requested transition — PHYSICAL PASS.** "Cuando completamos lo de entrenar?" → *"Encontré el compromiso 'entrenar', pero no encuentro evidencia de que se haya producido esa transición."* (1 fuente). Confirms: canonical entity resolved correctly; the requested completion transition is absent from canonical evidence; Core represents that absence explicitly rather than substituting a different true fact; the commitment's own cancellation is not narrated as if it answered "when did we complete it"; the homonym proposal's rejection is excluded entirely; no accepted/confirmed lifecycle event is substituted either.
- (2) **Positive cancellation — PHYSICAL PASS (regression-preserved).** "Cuando cancelamos lo de entrenar?" → cancellation 11 Sep 2026 11:43 local, current canonical state cancelled, 2 fuentes.

**M-4 — reschedule_commitment (staging commit `ca18aa5`) — PHYSICALLY CERTIFIED ON IPHONE.** Root cause of the earlier physical failure was `rescheduleCommitmentExecutor.ts` always calling `counterProposeCommitment` (which by design only writes `proposed_due_at` and waits for a different party to accept), even for a self-owned/self-assigned commitment where the actor is the only possible approver — so `due_at` never moved even though the executor reported `verified:true`. Fixed by reusing the same direct-edit path (`editCommitment`) mobile's own manual "Reprogramar fecha" button already used for this case, reserving `counterProposeCommitment` for a genuine counterparty. Physically re-certified end-to-end: Agent plan → explicit authorization → canonical `due_at` mutation → verified execution → immediate Hoy convergence → immediate Compromisos convergence, full physical pass. `respond_to_proposal`'s `counter_propose` decision and `complete_commitment` had a related but distinct weakness (verification accepted RPC success / mere entity existence without independently confirming the authorized field actually persisted) — both strengthened to the same canonical contract (authorized target + authorized mutation == canonical persisted truth), and both have since been physically certified on iPhone in their own right (see the two entries below).
- (3) **Positive completion, cross-entity disambiguation — PHYSICAL PASS (regression-preserved).** "Cuando completamos lo de ver Spiderman?" → completion 10 Sep 2026 22:33 local, current canonical state resolved, 2 fuentes, unrelated "Spiderman el Viernes" excluded.

Together these three physical results certify, in the running implementation: canonical target resolution happens deterministically in context building (`agentContextBuilder.service.ts#resolveRequestedTransitionTarget`), strictly before any LLM synthesis call, never reconstructed from what the model chooses to cite (LLM suggests, Core decides — entity resolution is never indirectly delegated to the model); the requested transition is verified structurally against canonical `commitment_event`/`commitment_status`-memory evidence for that exact resolved entity (`agentResponseSynthesizer.service.ts#enforceRequestedTransitionEvidence`); absence of matching evidence is a first-class, Core-enforced truthful outcome — never inferred voluntarily by the LLM, and never satisfied by a true-but-non-responsive fact (a current-status claim, a different transition, a homonym entity) standing in as the answer; a `commitment_proposal` can never satisfy or disable verification of a `commitment`'s requested transition (proposal ≠ commitment is preserved through this entire path); historical occurrence time is always the actor-local timestamp of the real canonical event, never `due_at`; and current canonical state may only enrich the single correctly linked entity, never a lexically similar but structurally distinct one. Implementation landed across commits `56533f3`, `4d9d81f`, `81be76a` (requested-transition table, propagation, tri-state memory agreement), `c47ffdc` (lineage-based multi-entity target resolution — since superseded), `3080c13` (deterministic target resolution moved into context building, before synthesis), and `fd98849` (absence enforcement made symmetric per-target-claim, closing the final physical gap where a true current-status claim could survive as a non-responsive substitute answer). Full backend (1440/1440) and mobile (705/705) suites pass; `tsc --noEmit` clean on both. Production untouched throughout.

**M-4 — respond_to_proposal / counter-propose — PHYSICALLY CERTIFIED ON IPHONE.** Physical case: "Propón cambiar la fecha del compromiso ir a parcela para mañana a las 9" — correct focused entity ("ir a parcela"), correct shared-proposal semantics, explicit authorization, execution completed, post-write verification succeeded, and the UI showed the real counter-proposal state ("ir a parcela", 14 sep · 09:00, "alejandra propone", "NUEVO HORARIO", "Pendiente de respuesta") with no unilateral canonical `due_at` mutation. Role authorization was also physically tested: when the current actor was the proposer rather than the responder, the Agent correctly refused an invalid proposal response instead of executing it. Both the counter-propose write path and the role-authorization guard are full physical passes.

**M-4 — complete_commitment — PHYSICALLY CERTIFIED ON IPHONE.** Physical case: "Completa el compromiso dejar excavadora en parcela indicando como resultado: prueba cierre Ping correcta" — target correctly extracted as "dejar excavadora en parcela", result correctly extracted as "prueba cierre Ping correcta", the plan targeted the correct commitment, explicit authorization occurred, execution returned verified success, the commitment became RESUELTO, and the UI converged immediately. The commitment detail sheet physically displayed both `Estado: Resuelto` and `Resultado: prueba cierre Ping correcta`. Target extraction, execution/verification, UI convergence, and resolution-result visibility are each independently confirmed full physical passes.

**Media deletion UX (staging commit `0e6ba75`) — MEDIA DELETION UX PHYSICALLY CERTIFIED ON IPHONE.** Scope: canonical message tombstone (`deleted_at`), attachment read disabled after tombstone, compact deleted-message presentation, persistence after chat reload, and Shared Media exclusion — both photo and video physically exercised. Photo: sent a new photo, deleted it, observed the compact "Mensaje eliminado" tombstone (no large empty media square, no thumbnail/player, no "Recuperando archivo..." spinner), left the chat and re-entered with the compact tombstone unchanged, and confirmed the deleted photo no longer appears in Fotos y videos / Shared Media. Video: identical sequence and identical result. This certifies presentation and access-control behavior only; current retention policy intentionally does not hard-delete the underlying Storage object, and no claim of physical Storage-object deletion is made.

**M-7 — Natural Conversational Intelligence (IN PROGRESS).** Scope: give Ping cross-turn context — the ability to resolve "eso"/"lo"/an omitted entity from what was just discussed — without weakening any existing authorization/verification invariant. Two distinct pieces exist today, at two different levels of confidence, tracked separately rather than blended into one claim:

- **M-7A/M-7B — write-path dialogue-state continuation (commits `70ef668`, `bac7036`).** A bare follow-up turn (e.g. "Como a las nueve") can complete an incomplete `create_commitment`/`create_personal_commitment` objective from the immediately prior turn (e.g. "Tengo que llamar a Pedro") instead of forcing the user to repeat the whole request. Architecture: dialogue state never itself authorizes anything — it only decides which objective enters the exact same, unmodified `runAgentPlanning`/authorization/execution pipeline every other turn already uses; a correction is made safe by the pre-existing "authorization always re-derives the plan digest from scratch" invariant, not by new bespoke invalidation logic (see `tmp/PING-M7-DIALOGUE-STATE-ADR.md` for the full design). Covered by unit and HTTP-boundary integration tests. **NOT YET PHYSICALLY CERTIFIED ON IPHONE.**
- **Pending-clarification answer consumption, generalized to two fields (branch `test/m7-read-followup-regression-20260920`, PR #3, not yet merged).** Originally hardcoded to `person_ambiguous` only ("¿cuál Pedro?" → "el que trabaja conmigo" resolves live via `resolvePerson`, never trusting the raw answer text). Generalized to also cover the planner's own `targetEntity` ambiguity for reschedule/complete/respond: "Completa Entrenar" with two same-titled candidate commitments asks "¿Cuál compromiso?", and a follow-up naming or distinguishing one (e.g. "el del jueves", resolved via the existing `date-parser.service.ts` grammar against each candidate's own `dueAt` — no new date grammar) completes the original objective and reaches the real planner. Root-cause fix alongside it: the write-turn bookkeeping gate that decides whether dialogue state persists at all was scoped to create-only objective types, so `targetEntity` ambiguities for reschedule/complete/respond were silently never tracked regardless of the answer-resolution side; fixed via an explicit union of both mechanisms' eligible types. Both fields share one dispatch point and one safety contract (escape detection first, live re-derivation always wins over any stored/cached candidate set). No mobile changes needed (`ClarificationQuestion.field` is already a plain string on the wire and in the mobile parser — confirmed via repo-wide grep, not assumed). Covered by 6 new end-to-end tests using the real deterministic verb path (no LLM interpreter mocks). **NOT YET PHYSICALLY CERTIFIED ON IPHONE.**
- **Read-path follow-up referent, generalized beyond one fixed sentence (same branch/PR).** Resolves the read-side analogue of the same problem: "¿Qué pasó con Ver Spiderman?" → "¿Y cuándo lo completamos?" previously lost the entity on the second turn. The mechanism never caches an answer or a date — only a verified `{id, title}` pair from a single-citation, single-commitment `answered` response, scoped per actor+conversation, TTL 2 minutes, and it only ever *rewrites the query* (forcing a fresh canonical re-read), never substitutes a remembered answer directly. Originally matched only the exact phrase "cuándo lo completamos"; generalized to a structural composition of existing signals (`isHistoricalLifecycleQuery`, itself extended to accept an elliptical Spanish object pronoun between the question word and the verb, covering all 8 closed-status lifecycle verbs plus reassign/accept/confirm/approve — not one hardcoded verb; the deterministic interpreter's own entity-naming signals; the existing write-action guard) rather than a single hardcoded sentence pattern, so it generalizes across lifecycle verbs and phrasings without a new hand-maintained vocabulary. **NOT a live Supabase/TLS/iPhone certification** — this is wiring-level proof only, and the branch is deliberately not merged to `codex/staging-beta` yet (stacked on PR #1, which itself is unmerged to avoid triggering staging auto-deploy).
- **Plan-shown, pre-authorization date correction (same branch/PR) — benchmark scenario 4.** "mueve entrenar al viernes" → [plan shown: "Mover Entrenar al viernes"] → "mejor al sábado" regenerates the plan with the corrected date instead of forcing the user to restate the whole request, and never leaves the old plan/digest silently confirmable. No new plan-invalidation logic: `AgentDialogueStateService.applyCorrection` (built in M-7A, wired to a live caller for the first time here) already clears the stale `currentPlanDigestRef` and reopens the dialogue for a fresh plan; `agentAuthorization.service.ts`'s existing re-plan-from-scratch + digest-comparison is what makes the old plan harmless the instant a corrected one exists. Root cause fixed during development: naively appending the new date phrase after the old one left the old date winning (the date parser matches the first date-shaped span in the text, not the last) — fixed by reusing the same chrono-anchored span-stripping logic the reschedule interpreter itself already uses to separate a target from its date clause, applied here to remove the *old* date before appending the new one. **NOT YET PHYSICALLY CERTIFIED ON IPHONE.**
- **Read semantic ownership / V2-V4 orchestration (commits `6e8da99` through `76e1d04`).** A parallel, explicitly experimental line of work reconstructing the read path toward a cleaner separation between user-expressed meaning and canonical query execution (see `tmp/PING-M7-READ-SEMANTIC-OWNERSHIP-ADR.md` and `docs/PING-M7-READ-EXECUTION-CAPABILITY-MATRIX.md`). Gated behind two independent, both-off-by-default flags — client (`EXPO_PUBLIC_ENABLE_READ_V4_EXACT_COUNT`, plus a non-production `APP_VARIANT` check) and server (`PING_ENABLE_READ_V4_EXACT_COUNT`, plus environment gating) — so it does not affect any live user today. One backend integration suite in this line (`agentTurnRoutingSelection.integration.test.ts`) requires a local Postgres reachable via `PING_M7_DATABASE_URL` and does not run in an environment without one configured; this is expected, not a regression (confirmed by direct isolation).

The three M-7 dialogue-continuity mechanisms and M-8's `remember_fact` together are covered by 45 new tests (17 + 28) using the real deterministic verb path (no LLM interpreter mocks) on branch `test/m7-read-followup-regression-20260920` — current state of that branch: 113/113 backend files, 2060/2060 tests passing, mobile 49/49 files, 824/824 unaffected (no mobile changes needed), `tsc` clean.

**What M-7 does NOT yet do:** multi-turn slot correction beyond the four scenarios above, ordinal/list-position references ("cancela el último"), tool composition (two actions in one request), correction of a field other than date/time on an already-shown plan (e.g. correcting the recipient of a message plan), or any pending-clarification field beyond `person_ambiguous`/`targetEntity` (e.g. `newDueAt`/`title` as a standalone clarification field, which would need date-parsing/free-text reconciliation instead of candidate selection — a materially different shape, explicitly deferred). See `tmp/PING-M7-JARVIS-ARCHITECTURE-GAP-AUDIT.md` for the full gap analysis this milestone is working through; it is a living plan, re-verified against source rather than re-run as a fresh audit each time.

**M-8 — `remember_fact` (same branch/PR #3).** Investigated the memory subsystem end to end and found the LLM-based extraction pipeline (`memoryExtractionProvider.service.ts`) architecturally complete but deliberately never connected to a live provider or automatic trigger (explicit prior decision, documented in that file's own header) — and no path existed anywhere for a user to directly ask Ping to remember something. The only live memory-write path was deterministic commitment-status-change events (`dispatchCommitmentStatusMemoryEvent`, already wired and working since before this session). This meant the product's own opening promise ("Ping remembers what matters") was untrue today for any personal fact that isn't a commitment status change. "Recuerda que mi hermano se llama Andrés" now plans/authorizes/executes through the exact same pipeline every other write tool uses; the content to remember is Core-verified as a real, unambiguous, verbatim substring of what the user typed (mirroring `send_message`'s own verbatim-content discipline), never text the interpreter could paraphrase or invent. A real policy gap was found and closed in the process: without it, an explicitly user-requested, user-authorized fact with a generic predicate would have landed at a database status that `retrieveMemory` never reads, making "recordado" a claim Ping could never actually honor — closed with a narrow, explicitly-scoped policy addition, verified (including one test against the real, unmocked sensitivity classifier) to leave every existing sensitive/restricted protection untouched. Covered by 28 new tests across policy/planner/executor/end-to-end layers on branch `test/m7-read-followup-regression-20260920`. **NOT YET PHYSICALLY CERTIFIED ON IPHONE** — and uniquely among the six write tools, this one's correctness depends on a second subsystem (memory retrieval/citation on the read side) actually recalling what was written, not just the write succeeding in isolation; see the PR's own physical-scenario recommendation.

Validated baseline at the current staging release-audit state (not claimed as eternal — re-verify against a live run before trusting these as current): backend **111 test files, 2022/2022 passing** on `codex/staging-beta` (excludes 4 integration suites requiring a local Postgres not available in every environment — see M-7 note above); mobile **48 test files, 824/824 passing**; `tsc --noEmit` clean on both; `git diff --check` clean. See above for the separate, higher count validated on the unmerged M-7 PR #3 branch.

**Release classification: C — RELEASE CANDIDATE.** No known P0/P1 product blockers at this staging state; remaining findings are P2/P3/post-MVP/operational (see `tmp/PING-RELEASE-READINESS-AUDIT-2026-09-13.md` for the full delta audit). This describes staging readiness only — it is not a claim of "production deployed" or "production authorized" or unconditional production-readiness; production deployment still requires explicit human authorization. Intentional, truthful-unsupported Agent capability gaps remain by design: `cancel_commitment`, `reopen_commitment`, and proposer-side proposal withdrawal are not registered Agent write tools (their canonical non-Agent paths exist and work; the Agent responds honestly that it cannot do them yet rather than substituting a different action). Archived commitments remain excluded from normal Agent retrieval/canonical-truth fallback by design; the current absence of a dedicated capability-gap message for an explicit archived-query request is a known non-blocking P2 UX gap, not a truthfulness or safety issue. **This classification predates M-7 and M-8 (dated 2026-09-13; M-7 work started 2026-09-14, M-8 started 2026-09-20) and does not cover either** — M-7's write-path piece is live-wired but not physically certified, its read-path piece is on an unmerged branch, and M-8's `remember_fact` is a new write tool on that same unmerged branch, also not physically certified; re-audit once M-7/M-8 reach physical certification rather than assuming this classification extends to them.

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
