// M-8 — remember_fact executor. Sixth WRITE tool, first outside the
// commitment/messaging domain: writes a durable personal memory record the
// user explicitly asked Ping to remember.
//
// Reuses the EXISTING canonical memory-write authority unconditionally
// (memory.service.ts#ingestMemoryFromEvent — "the ONE authority for
// memory_records writes, nothing else in the backend does
// `.from('memory_records').insert(...)` directly", per that file's own
// header). This executor never inserts anything itself; it only constructs
// the MemoryIngestionSourceEvent the SAME way any other caller must
// (extractionMethod='manual' — the user directly stated this content and
// explicitly authorized the exact plan showing it, the highest-trust
// extraction method that already exists in the type, never invented here).
//
// CRITICAL: "inserted" alone is NOT sufficient for verified:true.
// retrieveMemory only ever reads status='active' (memory.service.ts's own
// query filters WHERE status='active') — a row landing at status='candidate'
// (e.g. because it happened to match a still-unclassified predicate
// category, or because subject resolution left it unresolved) would be a
// real database row that Ping can never actually recall, which is exactly
// the "claims success but the claim doesn't hold up under independent
// re-verification" failure mode this codebase's own post-write verification
// discipline exists to catch everywhere else (see createCommitmentExecutor's
// own header comment on the same principle). This executor treats only
// status==='active' (a fresh insert or an existing/updated record that is
// itself active) as true success.
import { ingestMemoryFromEvent } from '../memory.service';
import type { ToolExecutor, ToolExecutionContext, ToolExecutionOutcome } from '../../types/agentExecution';

export const rememberFactExecutor: ToolExecutor = {
    toolId: 'remember_fact',
    version: 1,

    async execute(context: ToolExecutionContext, args: Record<string, unknown>): Promise<ToolExecutionOutcome> {
        const factContent = String(args.factContent).trim();
        if (!factContent) {
            // Structurally unreachable in practice (the tool's own Zod
            // argument schema already enforces min(1)) -- kept as an
            // explicit guard rather than trusting the schema alone, same
            // defense-in-depth discipline as the rest of this file.
            return { status: 'failed_terminal', failureCode: 'verification_failed', verified: false };
        }

        const now = new Date().toISOString();
        const outcome = await ingestMemoryFromEvent({
            ownerUserId: context.actorUserId,
            sourceType: 'manual',
            // context.idempotencyKey is the same stable, unique-per-logical-
            // request identifier sendMessageExecutor.ts already reuses for
            // its own idempotency purpose — here it doubles as this memory
            // record's evidence sourceId, since a remember_fact execution
            // has no conversationId/commitmentId of its own to point to.
            sourceId: context.idempotencyKey,
            conversationId: null,
            observedAt: now,
            evidenceRefs: [{ sourceType: 'manual', sourceId: context.idempotencyKey, timestamp: now }],
            extractionMethod: 'manual',
            candidate: {
                memoryTypeHint: 'semantic',
                subjectHint: null,
                // A generic predicate deliberately outside every keyword-
                // based low-risk allowlist in memoryAutoStorePolicy.ts —
                // this fact's auto_store eligibility comes ONLY from
                // extractionMethod='manual' mapping to the
                // 'user_requested_manual' risk category (see that file),
                // never from this predicate string being recognized.
                predicateHint: 'user_requested_memory',
                objectValueHint: factContent,
                canonicalTextHint: factContent,
                confidenceHint: 1,
            },
        }, context.traceId);

        if (outcome.kind === 'rejected') {
            return { status: 'failed_terminal', failureCode: 'policy_blocked', verified: false, resultRef: { reason: outcome.reason } };
        }
        if (outcome.kind === 'inserted') {
            const verified = outcome.status === 'active';
            return verified
                ? { status: 'succeeded', verified: true, resultRef: { memoryRecordId: outcome.id, status: outcome.status }, createdEntityRefs: [{ entityType: 'memory_record', entityId: outcome.id }] }
                : { status: 'failed_terminal', failureCode: 'policy_blocked', verified: false, resultRef: { memoryRecordId: outcome.id, status: outcome.status } };
        }
        if (outcome.kind === 'duplicate') {
            // An identical fact (same owner/subject/predicate/object,
            // content-hash deduped) already exists — this is a genuine,
            // honest success (the user's request is already satisfied), not
            // a failure. Never claims a NEW record was created.
            return { status: 'succeeded', verified: true, resultRef: { memoryRecordId: outcome.existingId, status: 'duplicate' } };
        }
        // 'superseded': the new fact replaced an existing one under the
        // same (owner, subject, predicate) key — a genuine, verified
        // success; the new content is what Ping will recall going forward.
        return { status: 'succeeded', verified: true, resultRef: { memoryRecordId: outcome.id, status: 'superseded_prior' } };
    },
};
