// M-2 FINAL — OPERATIONAL MEMORY + CANONICAL INVARIANTS.
//
// ÚNICO límite de integración entre el Core canónico (commitments/
// commitment_proposals) y la memoria derivada. Nunca se llama a
// memory.service.ts directamente desde un controller o desde múltiples
// puntos con lógica distinta -- este archivo es la ÚNICA puerta ("one
// intentional integration boundary", sección 9 del ticket).
//
// Semántica de falla (sección 10): se invoca SIEMPRE DESPUÉS de que la
// escritura canónica real ya se confirmó (el RPC de transición/aprobación ya
// corrió y devolvió `data`). Esta función nunca lanza -- mismo patrón ya
// establecido en este repo para efectos posteriores a una transición
// (ver commitment.service.ts#insertSystemMessage: try/catch propio, error
// logueado, nunca relanzado). La verdad canónica JAMÁS depende de que la
// memoria derivada tenga éxito.
import { deriveMemoryFromCommitmentStatusChange } from './memory.service';
import { traceMemory } from '../utils/memoryTrace';

export interface CommitmentStatusChangeEvent {
    ownerUserId: string;
    sourceType: 'commitment' | 'commitment_proposal';
    sourceId: string;
    title: string;
    newStatus: string;
    conversationId: string | null;
    occurredAt?: string;
}

export async function dispatchCommitmentStatusMemoryEvent(event: CommitmentStatusChangeEvent, traceId?: string): Promise<void> {
    if (!event.ownerUserId || !event.sourceId || !event.newStatus) return; // nunca crashea por un dato faltante en el efecto posterior
    try {
        const outcome = await deriveMemoryFromCommitmentStatusChange({
            ownerUserId: event.ownerUserId,
            sourceType: event.sourceType,
            sourceId: event.sourceId,
            title: event.title,
            newStatus: event.newStatus,
            conversationId: event.conversationId,
            occurredAt: event.occurredAt ?? new Date().toISOString(),
        });
        traceMemory(traceId, 'event_dispatched', { sourceType: event.sourceType, sourceId: event.sourceId, outcomeKind: outcome.kind, newStatus: event.newStatus });
    } catch (err) {
        // eslint-disable-next-line no-console
        console.error(
            '[PING_MEMORY_TRACE][event_dispatch_failed] la escritura canónica YA se confirmó antes de esta llamada -- esta falla nunca la afecta:',
            err instanceof Error ? err.message : err,
        );
    }
}
