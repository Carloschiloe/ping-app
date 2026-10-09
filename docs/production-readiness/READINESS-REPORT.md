# Readiness evidence at `ac7d72a`

This report is generated for the isolated preparation branch
`codex/production-readiness-ac7d72`. It does not certify production.

## Proven facts

| Item | Result |
|---|---|
| RC | `ac7d72af5dfd4a9744a356eca6539bab75609b22` |
| Production live SHA | `b6b7175f9b87abfa5fda422931f8e4c4fa92f5c8` |
| Production Supabase | `Ping / wbigqhtuzfmpnxservlf / INACTIVE` |
| Staging Supabase | `Ping Staging V2 / oonijgmddgyymhrlnvuu / ACTIVE_HEALTHY` |
| RC SQL migration files | 33 |
| Staging applied migrations | 33 (operator evidence) |
| Production applied migrations | UNKNOWN until restore/reactivation |
| Production health | FAIL; historical hostname cannot resolve while project is inactive |
| Database mutation | NONE |

## Contracts

The historical production runtime uses `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `ALLOWED_ORIGINS`, and
`ENCRYPTION_KEY`. The RC additionally requires explicit production runtime
selection (`PING_ENVIRONMENT=production`, `PING_SEMANTIC_MODEL=gpt-6-luna`,
`PING_SEMANTIC_MODEL_FAMILY=modern_reasoning`) and the OpenAI secret at runtime.
Staging-only durable-agent variables must not be copied to production.

## Migration outcome

The 33-file chain is suitable as a fresh-database reconstruction only after
its local execution is certified. For historical production, the correct
status of every file remains unknown until a read-only schema snapshot and
`supabase_migrations.schema_migrations` history are available. The baseline is
not a repair migration for the historical database.

Static classification: 1 `BASELINE_ONLY`, 30 `REQUIRES_REVIEW`, 2
`SAFE_FORWARD` under the conservative classifier. This is triage, not an
approval to apply any file.

## Gates

- Offline readiness tools: PASS.
- Read-only target guard: PASS.
- Secret redaction tests: PASS.
- Fresh Postgres rehearsal: NOT EXECUTED; Docker is unavailable and the local
  PostgreSQL instance rejects the available authentication. No credentials
  were guessed or requested.
- Real production inspector: NOT EXECUTED; project is inactive and no
  production database credential is present in this environment.
- Backup gate: PREPARED, not PASS; no backup was created.
- Post-restore orchestrator: PREPARED, explicit opt-in and production-ref
  guard; not executed while the project is inactive.
- Production preflight: BLOCKED by inactive DB, missing read-only evidence,
  missing backup gate, and absent production secret values.
