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

- **M-1 — Retrieval and context:** authorization-aware structured retrieval, identity resolution, context building, and evidence-backed agent responses.
- **M-2 — Memory:** evidence-linked memory ingestion/retrieval with sensitivity, freshness, invalidation, and canonical-fact dominance.
- **M-3 — Planning:** objective interpretation, deterministic resolution, `AgentPlan`, validation, digest, and clarification/authorization-ready states. PHYSICALLY CERTIFIED ON IPHONE.
- **M-4 — Authorization and execution:** exact-plan binding, expiring/revocable authorizations, idempotent step claiming, tool executors, verification, and audit records. CORE WRITE FLOW PHYSICALLY CERTIFIED ON IPHONE (send_message, create_commitment).
- **M-5 — Voice:** real mobile capture/transcription and editable transcript feeding the same Agent pipeline. Physical iPhone voice certification passed.
- **M-6 — Conversational Agent UX:** unified `/agent/turn`, Core-owned presentation, mobile plan confirmation, authorization, execution, and truthful result cards — DEPLOYED TO STAGING AND PHYSICALLY CERTIFIED ON IPHONE.

The global named-recipient fix (commit `19f5fd8e`) is deployed: one canonical person plus one authorized exact DIRECT conversation can become a `send_message` plan without a current chat context. M-6 physical certification (staging commit `930eca0`): global Agent Preview send_message reached PlanCard confirmation, authorize → execute → verify completed, and exactly one real message was delivered; the voice recorder lifecycle retest (record → background → return) also passed with no crash and no zombie microphone. Android voice remains future/non-blocking. M-3/M-4 physical certification (staging commit `02d4aa4`): the core write flow was verified end-to-end for both `send_message` (PlanCard showed recipient Alejandra and payload "llegaré tarde"; one confirmation triggered authorize → execute → verify; exactly one real message appeared in her chat) and `create_commitment` (PlanCard showed title "entrenar" for mañana 08:00; one confirmation triggered authorize → execute → verify; Compromisos count went from 6 to 7 with exactly one new "entrenar" entry). Replay/idempotency and exact-plan digest binding remain API/Core contract certification items, not physically re-verified per tool via ambiguous UI double-tap tests. Production is untouched.

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
