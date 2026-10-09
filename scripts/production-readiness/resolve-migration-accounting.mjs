import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const manifestPath = path.join(root, 'docs', 'production-readiness', 'migration-manifest.json');

const decisions = {
  '20260712000000_baseline_v2.sql': {
    status: 'EXPLICITLY_BLOCKED_WITH_PROVEN_REASON',
    reason: 'Fresh-database baseline; direct replay is forbidden against the historical project because its 18-table legacy schema was created outside the migration chain.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260713160000_fix_security_definer_execute_grants.sql': {
    status: 'HANDLED_BY_BRIDGE',
    reason: 'Security-definer EXECUTE hardening is represented by the guarded bridge; each function/grant is still checked by the final precheck before mutation.',
    requiresLiveSchema: true,
    dataRisk: 'none'
  },
  '20260728020000_add_private_file_references.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Additive nullable private-file reference columns; proceed only after exact column/type preconditions pass.',
    requiresLiveSchema: true,
    dataRisk: 'low'
  },
  '20260728180000_canonical_commitment_beta.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds proposal tables, indexes, policies and guarded proposal RPCs; depends on verified legacy Commitment/Conversation foreign-key contracts.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260728183000_atomic_commitment_evidence.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds audit/evidence objects and canonical RPC boundaries; no application of the RPCs is safe until their referenced legacy columns and grants are verified.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260728190000_message_idempotency_beta.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds client_message_id and unique/indexed idempotency boundaries; exact sender_id/conversation_id compatibility must be checked first.',
    requiresLiveSchema: true,
    dataRisk: 'medium'
  },
  '20260728200000_harden_commitment_beta_permissions.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Security-only table grants and service-role proposal writer boundary; requires the proposal objects to exist and policy/grant diff to be captured.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260729173000_reconcile_auth_profiles.sql': {
    status: 'HANDLED_BY_BRIDGE',
    reason: 'Additive Auth-to-profile reconciliation and signup trigger hardening are included in the guarded bridge and preserve Auth UUIDs.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260730123000_shared_commitment_agreements.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds proposal agreement/counterproposal fields and shared-proposal RPCs; requires verified proposal schema and participant ownership predicates.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260828160000_commitment_core_canonical_writes.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Changes canonical Commitment write RPCs and constraints; requires live constraint/function body comparison and a data-preserving rehearsal.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260829010000_harden_commitment_direct_writes.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Security boundary that revokes direct Commitment writes and leaves service-role canonical RPCs; exact existing policies/grants must be verified.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260830010000_messaging_core_canonical.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds receipt/event/tombstone objects and messaging RPCs with historical backfill logic; requires exact legacy message/conversation shape and row-count rehearsal.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260831010000_message_attachment_core.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds attachment lifecycle and RPCs without deleting Storage objects; requires exact message/conversation columns and Storage policy inventory.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260901010000_audio_attachment_transcription_pipeline.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds audio transcription lifecycle and leases over canonical attachments; requires attachment schema, RPC signatures and worker contract verification.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260903120000_conversation_manual_unread.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds participant unread state and replaces read RPC behavior; requires exact participant columns and policy/grant comparison.',
    requiresLiveSchema: true,
    dataRisk: 'medium'
  },
  '20260903150000_full_text_retrieval.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds text-search configuration/generated columns/indexes; requires extension/configuration support and exact source-column types before DDL.',
    requiresLiveSchema: true,
    dataRisk: 'medium'
  },
  '20260907010000_commitment_proposal_full_text_retrieval.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds proposal retrieval indexes/columns on top of canonical proposals; blocked only until the proposal contract is verified.',
    requiresLiveSchema: true,
    dataRisk: 'medium'
  },
  '20260907030000_canonical_memory_records.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Header says LOCAL ONLY, but the RC runtime and required schema contract use memory_records; this scope drift is resolved in favor of the current RC contract and must be explicitly included after schema/feature-gate verification.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260907040000_memory_record_evidence.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Depends on memory_records, which the current RC runtime and schema contract require; apply only as the paired evidence boundary after schema/feature-gate verification.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260908010000_agent_authorization_execution.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds durable authorization/execution objects required by the RC Core; requires exact actor, TTL, idempotency, RLS and service-role grant verification.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260910010000_message_attachment_size_policy.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Raises the canonical attachment size check and RPC validation; requires existing attachment function signature and Storage limit comparison.',
    requiresLiveSchema: true,
    dataRisk: 'medium'
  },
  '20260913010000_commitment_restore_with_evidence.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds the symmetric Commitment restore RPC and evidence event; requires existing canonical Commitment event constraints and owner checks.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260914010000_commitment_archived_write_guard.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Hardens canonical Commitment write RPCs against archived-row TOCTOU; requires exact current RPC signatures and body compatibility.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260914020000_agent_turn_admission.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds durable Agent Turn admission/sequence objects and private RPC boundary; requires actor FK, RLS and replay/idempotency preconditions.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260914030000_agent_turn_commit_boundary.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds semantic/dialogue checkpoints and atomic application RPC; requires exact admission contract and lock/order compatibility.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260914040000_agent_turn_semantic_v2.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Widens/version-checks the durable semantic checkpoint contract; requires checkpoint shape and historical-version compatibility.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260914050000_agent_turn_semantic_v3.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Extends the checkpoint semantic version contract to V3; must preserve V1/V2 rows and verify the current constraint.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260915010000_agent_turn_reconciliation.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds deterministic reconciliation for unknown atomic turn outcomes; requires existing admission/dialogue locks and private execution grants.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260915020000_agent_turn_semantic_v4.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Extends the checkpoint semantic version contract to V4; must be verified against existing historical checkpoint rows before constraint change.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260916010000_agent_turn_replay_v2.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds replay version behavior to the atomic turn application RPC; requires exact function body and idempotency state comparison.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260916020000_agent_turn_routing_mode.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Adds immutable routing mode to durable admission and private admission RPC; requires current admission state and allowed-mode review.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  },
  '20260916030000_agent_turn_routing_mode_postgrest.sql': {
    status: 'HISTORY_ONLY_AFTER_VERIFICATION',
    reason: 'Documented no-op migration; it has no schema mutation, but its version may be recorded only after the preceding routing-mode objects pass postcheck.',
    requiresLiveSchema: true,
    dataRisk: 'none'
  },
  '20260916040000_agent_turn_routing_mode_private.sql': {
    status: 'SAFE_FORWARD_AFTER_BRIDGE',
    reason: 'Revokes authenticator execution for the private routing RPC; requires exact function signature and grant inventory.',
    requiresLiveSchema: true,
    dataRisk: 'high'
  }
};

const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
const entries = manifest.migrations.map((migration) => {
  const decision = decisions[migration.file];
  if (!decision) throw new Error(`missing decision for ${migration.file}`);
  return { ...migration, ...decision };
});
const accountedFiles = new Set(entries.map(({ file }) => file));
const decisionFiles = Object.keys(decisions);
if (accountedFiles.size !== manifest.migrationCount || decisionFiles.length !== manifest.migrationCount) {
  throw new Error(`migration accounting mismatch: manifest=${manifest.migrationCount}, decisions=${decisionFiles.length}, entries=${accountedFiles.size}`);
}
const counts = Object.fromEntries([...new Set(entries.map(({ status }) => status))].map((status) => [status, entries.filter((entry) => entry.status === status).length]));
const output = {
  source: manifest.schemaSource,
  rcSha: manifest.generatedFrom,
  projectRef: 'wbigqhtuzfmpnxservlf',
  migrationCount: manifest.migrationCount,
  unknownCount: 0,
  counts,
  safeToApply: false,
  safetyReason: 'No bridge step is executable until the production read-only snapshot and verified external backup gates pass.',
  entries
};
// The managed execution environment intentionally treats generated artifacts in
// the preparation clone as read-only. Emit the canonical report to stdout so a
// caller can capture it in an operator-controlled, non-versioned location.
process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
