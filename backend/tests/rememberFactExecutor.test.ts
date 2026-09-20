import { describe, it, expect, vi, beforeEach } from 'vitest';

// M-8 — rememberFactExecutor. Mocks memory.service.ts#ingestMemoryFromEvent
// itself (already fully covered by its own dedicated suite,
// tests/memoryService.test.ts) rather than re-testing its internal
// classification/persistence-policy logic here -- this file verifies only
// the executor's OWN contract: it constructs the ingestion event correctly
// (extractionMethod='manual', sourceType='manual', the exact factContent
// argument, no invented data), and it honestly translates every possible
// MemoryIngestionOutcome into a ToolExecutionOutcome, in particular NEVER
// reporting verified:true for a real insert whose status ended up
// 'candidate' (the false-success mode this executor's own header comment
// explains in detail).
vi.mock('../src/services/memory.service', () => ({
    ingestMemoryFromEvent: vi.fn(),
}));

import { rememberFactExecutor } from '../src/services/toolExecutors/rememberFactExecutor';
import { ingestMemoryFromEvent } from '../src/services/memory.service';

const mockIngest = vi.mocked(ingestMemoryFromEvent);

function ctx() {
    return { actorUserId: 'actor-1', idempotencyKey: 'idem-remember-1', traceId: 'trace-1' };
}

beforeEach(() => {
    mockIngest.mockReset();
});

describe('rememberFactExecutor — honest translation of every MemoryIngestionOutcome (M-8)', () => {
    it('constructs the ingestion event correctly: manual extraction, manual source, the exact factContent, the actor as owner', async () => {
        mockIngest.mockResolvedValueOnce({ kind: 'inserted', id: 'mem-1', status: 'active' });

        await rememberFactExecutor.execute(ctx(), { factContent: 'Mi hermano se llama Andrés' });

        expect(mockIngest).toHaveBeenCalledTimes(1);
        const [event] = mockIngest.mock.calls[0];
        expect(event.ownerUserId).toBe('actor-1');
        expect(event.sourceType).toBe('manual');
        expect(event.sourceId).toBe('idem-remember-1');
        expect(event.extractionMethod).toBe('manual');
        expect((event.candidate as any).objectValueHint).toBe('Mi hermano se llama Andrés');
        expect((event.candidate as any).canonicalTextHint).toBe('Mi hermano se llama Andrés');
        // Never invents a subject -- the executor's first iteration never
        // attempts person resolution of free text.
        expect((event.candidate as any).subjectHint).toBeNull();
    });

    it('inserted + status active -> succeeded, verified:true, real createdEntityRefs', async () => {
        mockIngest.mockResolvedValueOnce({ kind: 'inserted', id: 'mem-1', status: 'active' });

        const outcome = await rememberFactExecutor.execute(ctx(), { factContent: 'Prefiero reuniones por la mañana' });

        expect(outcome).toEqual({
            status: 'succeeded', verified: true,
            resultRef: { memoryRecordId: 'mem-1', status: 'active' },
            createdEntityRefs: [{ entityType: 'memory_record', entityId: 'mem-1' }],
        });
    });

    // CRITICAL SAFETY TEST: this is the entire reason this executor exists
    // as a careful, non-trivial piece of code rather than a one-line
    // pass-through. A real inserted row whose status is 'candidate' (would
    // happen if e.g. the auto-store policy's guards fired for an unexpected
    // reason on some future predicate/content shape) is NEVER retrievable
    // by retrieveMemory (status='active' only) -- reporting verified:true
    // here would be Ping truthfully claiming "recordado" while silently
    // never being able to recall it again.
    it('inserted + status candidate -> failed_terminal, verified:false (NEVER a false success)', async () => {
        mockIngest.mockResolvedValueOnce({ kind: 'inserted', id: 'mem-1', status: 'candidate' });

        const outcome = await rememberFactExecutor.execute(ctx(), { factContent: 'Un hecho con clasificación de riesgo inesperada' });

        expect(outcome.status).toBe('failed_terminal');
        expect(outcome.verified).toBe(false);
        expect(outcome.resultRef).toEqual({ memoryRecordId: 'mem-1', status: 'candidate' });
    });

    it('rejected -> failed_terminal, verified:false, policy_blocked, exposes the real reason', async () => {
        mockIngest.mockResolvedValueOnce({ kind: 'rejected', reason: 'missing_evidence' });

        const outcome = await rememberFactExecutor.execute(ctx(), { factContent: 'algo' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'policy_blocked', verified: false, resultRef: { reason: 'missing_evidence' } });
    });

    it('duplicate -> succeeded, verified:true, references the EXISTING record id, never fabricates a new one', async () => {
        mockIngest.mockResolvedValueOnce({ kind: 'duplicate', existingId: 'mem-existing-1' });

        const outcome = await rememberFactExecutor.execute(ctx(), { factContent: 'Un hecho ya guardado antes, textualmente igual' });

        expect(outcome).toEqual({
            status: 'succeeded', verified: true,
            resultRef: { memoryRecordId: 'mem-existing-1', status: 'duplicate' },
        });
    });

    it('superseded -> succeeded, verified:true, references the NEW record id (the one that now holds the current fact)', async () => {
        mockIngest.mockResolvedValueOnce({ kind: 'superseded', id: 'mem-new-1', supersededId: 'mem-old-1' });

        const outcome = await rememberFactExecutor.execute(ctx(), { factContent: 'Una actualización de un hecho previo' });

        expect(outcome).toEqual({
            status: 'succeeded', verified: true,
            resultRef: { memoryRecordId: 'mem-new-1', status: 'superseded_prior' },
        });
    });

    it('empty/whitespace-only factContent never reaches ingestMemoryFromEvent at all (defense-in-depth guard, structurally unreachable via the real Zod schema but still checked)', async () => {
        const outcome = await rememberFactExecutor.execute(ctx(), { factContent: '   ' });

        expect(outcome).toEqual({ status: 'failed_terminal', failureCode: 'verification_failed', verified: false });
        expect(mockIngest).not.toHaveBeenCalled();
    });
});

describe('rememberFactExecutor — END-TO-END SAFETY: sensitive content is never silently auto_store-d, even via the highest-trust manual method', () => {
    it('confirms the REAL memory.service.ts (not mocked) still gates a sensitive manual fact behind requires_confirmation -- proving remember_fact does not create a policy bypass', async () => {
        vi.doUnmock('../src/services/memory.service');
        vi.resetModules();
        const { decideMemoryPersistence } = await import('../src/services/memoryAutoStorePolicy');
        const { classifySensitivity } = await import('../src/services/memory.service');

        // "mi contraseña del banco es 1234" -> classifySensitivity must flag
        // this via its existing 'contrasena'/'password' keyword coverage,
        // completely independent of extractionMethod.
        const sensitivity = classifySensitivity('user_requested_memory', 'mi contraseña del banco es 1234', undefined);
        expect(sensitivity).not.toBe('normal');

        const outcome = decideMemoryPersistence({
            memoryType: 'semantic', predicate: 'user_requested_memory', sensitivity,
            sourceType: 'manual', extractionMethod: 'manual', confidence: 1, identityResolved: true,
        });
        // Never auto_store for genuinely sensitive content, regardless of
        // how high-trust the extraction method is.
        expect(outcome).not.toBe('auto_store');
    });
});
