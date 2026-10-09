# Migration accounting for the historical production project

This is a deterministic, repository-derived classification for all 33 RC
migrations. It is not an approval to execute SQL. `UNKNOWN=0` means that every
file has a named disposition and reason; it does not mean that the guarded
forward steps are executable without a production schema snapshot.

The machine-readable source is `scripts/production-readiness/resolve-migration-accounting.mjs`.
It validates one decision for every file in `migration-manifest.json` and emits
the complete report to stdout for capture outside the repository.

| Migration | Disposition | Evidence / gate |
|---|---|---|
| `20260712000000_baseline_v2.sql` | `EXPLICITLY_BLOCKED_WITH_PROVEN_REASON` | Fresh-database baseline; historical production already has the legacy 18-table inventory. Never replay directly. |
| `20260713160000_fix_security_definer_execute_grants.sql` | `HANDLED_BY_BRIDGE` | Security-definer EXECUTE hardening is represented by guarded bridge logic; exact live signatures/grants still require precheck. |
| `20260728020000_add_private_file_references.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Additive nullable file-reference columns; exact types must pass precheck. |
| `20260728180000_canonical_commitment_beta.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Proposal tables/RPCs; legacy Commitment/Conversation FK contract must pass precheck. |
| `20260728183000_atomic_commitment_evidence.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Evidence/audit RPC boundary; referenced legacy columns and grants must pass precheck. |
| `20260728190000_message_idempotency_beta.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Idempotency column/index; sender and conversation shape must pass precheck. |
| `20260728200000_harden_commitment_beta_permissions.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Proposal table grants and service-role boundary; exact policy/grant diff required. |
| `20260729173000_reconcile_auth_profiles.sql` | `HANDLED_BY_BRIDGE` | Additive Auth/profile reconciliation and signup trigger hardening preserve Auth UUIDs. |
| `20260730123000_shared_commitment_agreements.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Proposal agreement/counterproposal contract; participant predicates require verification. |
| `20260828160000_commitment_core_canonical_writes.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Canonical Commitment RPC/constraint change; live body and data-safe rehearsal required. |
| `20260829010000_harden_commitment_direct_writes.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Revokes direct Commitment writes; exact existing policies/grants required. |
| `20260830010000_messaging_core_canonical.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Receipts/events/tombstones plus historical backfill; exact legacy shape and row rehearsal required. |
| `20260831010000_message_attachment_core.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Attachment lifecycle; message/conversation and Storage policy inventory required. |
| `20260901010000_audio_attachment_transcription_pipeline.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Audio leases/transcription; attachment/RPC/worker contract required. |
| `20260903120000_conversation_manual_unread.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Participant unread state and read RPC; exact participant policy/grant comparison required. |
| `20260903150000_full_text_retrieval.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | FTS configuration/generated columns/indexes; extension and source types required. |
| `20260907010000_commitment_proposal_full_text_retrieval.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Proposal retrieval index/column; proposal contract required. |
| `20260907030000_canonical_memory_records.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Header says LOCAL ONLY, but RC runtime and schema contract use `memory_records`; include only after schema and feature-gate verification. |
| `20260907040000_memory_record_evidence.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Paired evidence boundary required by the current RC memory runtime; include only with `memory_records` and postcheck. |
| `20260908010000_agent_authorization_execution.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Durable authorization/execution objects; actor, TTL, idempotency, RLS and grants required. |
| `20260910010000_message_attachment_size_policy.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Attachment size/RPC policy; function signature and Storage limit comparison required. |
| `20260913010000_commitment_restore_with_evidence.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Restore RPC/event; canonical event constraints and owner checks required. |
| `20260914010000_commitment_archived_write_guard.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Archived-row TOCTOU hardening; exact current RPC signatures required. |
| `20260914020000_agent_turn_admission.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Durable Agent Turn admission/sequence; actor FK, RLS and replay gates required. |
| `20260914030000_agent_turn_commit_boundary.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Checkpoints/atomic application; lock/order compatibility required. |
| `20260914040000_agent_turn_semantic_v2.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Semantic checkpoint V2 constraint; historical version compatibility required. |
| `20260914050000_agent_turn_semantic_v3.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Semantic checkpoint V3 constraint; V1/V2 rows must remain valid. |
| `20260915010000_agent_turn_reconciliation.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Unknown-outcome reconciliation; admission/dialogue lock and grant contract required. |
| `20260915020000_agent_turn_semantic_v4.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Semantic checkpoint V4 constraint; existing rows must be checked first. |
| `20260916010000_agent_turn_replay_v2.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Replay/idempotency RPC behavior; exact function body/state contract required. |
| `20260916020000_agent_turn_routing_mode.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Routing-mode admission; allowed modes and current state required. |
| `20260916030000_agent_turn_routing_mode_postgrest.sql` | `HISTORY_ONLY_AFTER_VERIFICATION` | Documented no-op; history may be reconciled only after routing objects pass postcheck. |
| `20260916040000_agent_turn_routing_mode_private.sql` | `SAFE_FORWARD_AFTER_BRIDGE` | Revokes authenticator execution; exact signature/grants required. |

## Totals

- `MIGRATIONS_TOTAL=33`
- `MIGRATIONS_ACCOUNTED_FOR=33`
- `MIGRATIONS_UNKNOWN=0`
- `EXPLICITLY_BLOCKED_WITH_PROVEN_REASON=1`
- `HANDLED_BY_BRIDGE=2`
- `SAFE_FORWARD_AFTER_BRIDGE=29`
- `HISTORY_ONLY_AFTER_VERIFICATION=1`
- `MIGRATIONS_NOT_APPLICABLE=0`

The baseline is explicitly blocked because it is a fresh-database
reconstruction. The two memory migrations have a documented scope contradiction
but are required by the current RC runtime, so they are forward candidates with
an explicit feature/scope gate rather than silently omitted. The 29 forward
entries remain gated by the missing live column/constraint/policy/grant
snapshot and by the external backup gate.
