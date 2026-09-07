// M-2 FINAL — OPERATIONAL MEMORY + CANONICAL INVARIANTS, sección 12.
//
// Abstracción de proveedor de extracción, mismo patrón ya establecido en
// este repo para modelos intercambiables (ver `AgentSynthesisModel` en
// agentResponseSynthesizer.service.ts / `AgentInputModel` en
// agentInputInterpreter.service.ts): una interfaz mínima, un provider real
// pluggeable después, y en tests SIEMPRE un fake -- nunca la red real, nunca
// acoplado a OpenAI en el tipo de la interfaz.
//
// Esta entrega NO enciende extracción automática de memoria para cada
// mensaje (decisión explícita del ticket: "no necesariamente activar LLM
// memory automático para cada mensaje ahora") -- lo que se cierra aquí es la
// ARQUITECTURA: el pipeline completo proveedor -> parse -> validar -> ingesta
// es real y está probado de punta a punta con un fake provider, listo para
// que un futuro ticket conecte un proveedor real detrás de la MISMA interfaz
// sin tocar memory.service.ts.
import { ingestMemoryFromEvent } from './memory.service';
import type { MemoryEvidenceRef, MemoryExtractionMethod, MemoryIngestionOutcome, MemorySourceType } from '../types/memory';

export interface MemoryExtractionInput {
    text: string;
}

// Devuelve datos CRUDOS, no confiados -- cada elemento pasa íntegro por
// parseMemoryExtractionCandidate (whitelist estricta) antes de convertirse
// en algo que memory.service.ts pueda siquiera considerar.
export interface MemoryExtractionProvider {
    readonly providerName: string;
    extractCandidates(input: MemoryExtractionInput): Promise<unknown[]>;
}

// ─── Orquestación real (Core-resuelto, nunca el provider) ─────────────────
// Todo lo que identifica DÓNDE/DE QUIÉN/CUÁNDO viene del LLAMADOR (evento
// real ya autorizado), NUNCA del provider -- mismo principio que
// MemoryIngestionSourceEvent en general.
export interface MemoryExtractionRunContext {
    ownerUserId: string;
    sourceType: MemorySourceType;
    sourceId: string;
    conversationId: string | null;
    observedAt: string;
    evidenceRefs: MemoryEvidenceRef[];
    extractionMethod: Extract<MemoryExtractionMethod, 'llm'>;
    modelProvider: string;
    modelVersion?: string;
}

export interface MemoryExtractionRunResult {
    candidatesReturned: number;
    outcomes: MemoryIngestionOutcome[];
}

// Un candidato individual mal formado (o rechazado por política) NUNCA
// bloquea a los demás -- se procesan independientemente, mismo principio de
// "todo-o-nada por unidad, nunca por lote" ya usado en el resto del sistema
// (ver validateClaimsAgainstAllowedRefs, política por-claim).
export async function runMemoryExtraction(
    provider: MemoryExtractionProvider,
    input: MemoryExtractionInput,
    context: MemoryExtractionRunContext,
    traceId?: string,
): Promise<MemoryExtractionRunResult> {
    const rawCandidates = await provider.extractCandidates(input);
    const outcomes: MemoryIngestionOutcome[] = [];
    for (const rawCandidate of rawCandidates) {
        const outcome = await ingestMemoryFromEvent({
            ownerUserId: context.ownerUserId,
            sourceType: context.sourceType,
            sourceId: context.sourceId,
            conversationId: context.conversationId,
            observedAt: context.observedAt,
            evidenceRefs: context.evidenceRefs,
            extractionMethod: context.extractionMethod,
            modelProvider: context.modelProvider,
            modelVersion: context.modelVersion,
            candidate: rawCandidate,
        }, traceId);
        outcomes.push(outcome);
    }
    return { candidatesReturned: rawCandidates.length, outcomes };
}
