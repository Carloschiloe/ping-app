# Ping — permanent autonomous development protocol

This protocol is the durable operating contract for coding agents and
architect/gatekeeper reviews. The current values live in
`PING-PROJECT-STATE.md`; the ordered work lives in `PING-TASK-QUEUE.md`.

## Product and architecture

- Ping remains a messaging, memory and commitment product while new voice,
  device and automation surfaces are added over the same Ping Core.
- The North Star is natural horizontal assistance with context, references,
  corrections, useful memory, controlled initiative and safe tools.
- The LLM proposes structured meaning. Core owns identity, authorization,
  state, persistence, confirmation, planning, execution and truthfulness.
- Do not move human language into growing keyword, regex, phrase or case-ID
  lists. Deterministic code may validate safety and structure, not replace
  general semantic interpretation.

## Permanent loop

`OBSERVE -> REPRODUCE -> DIAGNOSE -> DESIGN -> IMPLEMENT -> TEST -> REGRESSION -> SECURITY CHECK -> COMMIT -> CI -> STAGING -> E2E -> ANALYZE -> SELF-CORRECT -> UPDATE STATE -> NEXT TASK`

For every failure, identify the responsible layer before changing code. Never
change product behavior to satisfy a broken harness or fixture.

## Gates and authority

- Local changes may be investigated and tested autonomously.
- `codex/staging-beta` is the only development publication path currently
  authorized by this project state.
- The permanent staging workflow runs quality first, calls only the staging
  deploy hook, verifies health and exact SHA, then runs the current milestone
  E2E. A mismatch prevents E2E.
- `main`, production services, production data, production credentials,
  destructive operations and secret/permission changes are outside the loop.
- A human gate is required for product/business decisions, irreversible or
  destructive actions, sensitive external credentials/permissions, serious
  architectural conflicts and milestone completion. Record it in the project
  state with `HUMAN_GATE_REQUIRED`, `REASON`, `EVIDENCE`, `OPTIONS` and
  `RECOMMENDED_NEXT_TECHNICAL_ACTION`; do not hide it in chat.

## Evidence standard

Each completed task records the exact commit, tests, staging SHA, health,
E2E artifact, security invariants and remaining limitations. Holdouts and
natural variations are preferred over reusing a known phrase. A milestone
completion candidate must explicitly state what is not demonstrated and what
remains Legacy.

## Security invariants

Check auth, authorization, RLS/tenant isolation, secret handling, input
boundaries, persistence/reload, CAS/versioning, idempotency, confirmation
binding, cross-objective leakage, stale state, tool authorization, cleanup
and truthful execution claims whenever the change touches them.

