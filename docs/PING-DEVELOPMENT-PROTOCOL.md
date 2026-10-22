# Ping — permanent autonomous development protocol

> **Entorno vigente:** producción (`main`, Render `ping-app`, Supabase
> `wbigqhtuzfmpnxservlf`). Las referencias históricas a staging que puedan
> aparecer en estados, colas o evidencias no son una ruta de publicación ni un
> destino operativo.

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

`OBSERVE -> REPRODUCE -> DIAGNOSE -> DESIGN -> IMPLEMENT -> TEST -> REGRESSION -> SECURITY CHECK -> COMMIT -> CI -> PRODUCTION RELEASE GATE -> E2E -> ANALYZE -> SELF-CORRECT -> UPDATE STATE -> NEXT TASK`

For every failure, identify the responsible layer before changing code. Never
change product behavior to satisfy a broken harness or fixture.

## Gates and authority

- Local changes may be investigated and tested autonomously.
- `main` is the production publication branch. A release must pass the
  production readiness gates and verify the exact deployed SHA before E2E.
- There is no current staging publication path. Historical staging workflows,
  SHAs and artifacts remain evidence only and must not be reactivated by
  changing a branch filter or hook.
- Production services, production data, production credentials, destructive
  operations and secret/permission changes remain behind an explicit human
  gate.
- A human gate is required for product/business decisions, irreversible or
  destructive actions, sensitive external credentials/permissions, serious
  architectural conflicts and milestone completion. Record it in the project
  state with `HUMAN_GATE_REQUIRED`, `REASON`, `EVIDENCE`, `OPTIONS` and
  `RECOMMENDED_NEXT_TECHNICAL_ACTION`; do not hide it in chat.

## Evidence standard

Each completed task records the exact commit, tests, production SHA, health,
E2E artifact, security invariants and remaining limitations. Historical staging
SHAs may be recorded only as dated evidence, never as current release proof.
Holdouts and
natural variations are preferred over reusing a known phrase. A milestone
completion candidate must explicitly state what is not demonstrated and what
remains Legacy.

## Security invariants

Check auth, authorization, RLS/tenant isolation, secret handling, input
boundaries, persistence/reload, CAS/versioning, idempotency, confirmation
binding, cross-objective leakage, stale state, tool authorization, cleanup
and truthful execution claims whenever the change touches them.

