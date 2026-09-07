// M-2 ABSOLUTE FINAL — MEMORY CONTRACT CLOSURE, sección 1-4.
//
// "classifySensitivity devolvió 'sensitive'" NO es, por sí sola, una
// política de persistencia -- es sólo una CLASIFICACIÓN. Este archivo es la
// política real: decide qué pasa con un candidato.
//
// CIERRE DEL BLOCKER A: la versión anterior trataba
// `sensitivity==='normal' && identityResolved && confidence alta` como
// "seguro para auto_store" -- eso es exactamente "ausencia de keyword
// sensible == seguro para persistir de forma durable", que este ticket
// señala explícitamente como INSUFICIENTE. classifySensitivity es un
// detector por palabras clave: nunca puede tener 100% de recall en lenguaje
// natural, así que "normal" significa "no until encontramos una razón para
// sospechar", NUNCA "confirmado inofensivo".
//
// La política ya NO usa "normal-by-default = auto_store-by-default".
// En su lugar, separa dos preguntas distintas:
//   1. content classification  (classifySensitivity -- ¿hay una señal de
//      riesgo detectable?)
//   2. persistence authority   (este archivo -- ¿esta CATEGORÍA de hecho
//      está en el allowlist explícito de bajo riesgo?)
// auto_store SÓLO ocurre cuando AMBAS dicen "seguro": sensibilidad='normal'
// Y la categoría del hecho está en el allowlist explícito. Cualquier hecho
// semantic-personal generado por LLM que classifySensitivity no marcó como
// sensible PERO que tampoco cae en una categoría de bajo riesgo conocida
// (`unclassified`) nunca se auto-almacena -- el "no sé" del clasificador
// nunca se traduce en "es seguro".
import type { MemoryExtractionMethod, MemorySensitivity, MemorySourceType, MemoryType } from '../types/memory';

export type MemoryPersistenceOutcome = 'auto_store' | 'candidate_only' | 'requires_confirmation' | 'never_store';

export type MemoryRiskCategory = 'benign_preference' | 'project_context' | 'canonical_event_history' | 'unclassified';

export interface MemoryPersistenceDecisionInput {
    memoryType: MemoryType;
    // El predicate normalizado (ya en minúsculas) -- se usa SÓLO para
    // reconocer una categoría explícita de bajo riesgo, nunca para adivinar
    // sensibilidad (eso sigue siendo trabajo exclusivo de classifySensitivity).
    predicate: string;
    sensitivity: MemorySensitivity;
    sourceType: MemorySourceType;
    extractionMethod: MemoryExtractionMethod;
    confidence: number;
    // false sólo cuando el candidato AFIRMÓ un sujeto (subjectHint no nulo)
    // pero no resolvió a una identidad canónica real -- ver
    // memory.service.ts#resolveMemorySubject. true también cuando el hecho
    // no reclama ningún sujeto (nada que resolver).
    identityResolved: boolean;
}

// Umbral deliberadamente conservador: una extracción LLM con confianza baja
// es exactamente el caso "incierto" que nunca debe auto-activarse.
const LOW_CONFIDENCE_THRESHOLD = 0.5;

// ─── Allowlist explícito de bajo riesgo (sección 3) ────────────────────────
// Deliberadamente chico y basado en PREFIJOS de predicate reconocidos, no en
// un intento de cubrir "todo lo no sensible" -- lo que NO está aquí cae a
// 'unclassified' por diseño, nunca al revés. Nuevas categorías se agregan
// explícitamente aquí, nunca se infieren.
const BENIGN_PREFERENCE_PREFIXES = ['prefers', 'prefiere', 'likes', 'enjoys', 'favorite', 'preferred_'];
const PROJECT_CONTEXT_PREFIXES = ['project_', 'topic_', 'works_on', 'role_in_project'];

export function classifyMemoryRiskCategory(predicate: string, extractionMethod: MemoryExtractionMethod): MemoryRiskCategory {
    // Determinístico (deriveMemoryFromCommitmentStatusChange y equivalentes
    // futuros): nunca proviene de un LLM, no hay incertidumbre de extracción
    // que gestionar -- siempre es historial de evento canónico de bajo riesgo.
    if (extractionMethod === 'deterministic') return 'canonical_event_history';
    const p = predicate.toLowerCase();
    if (BENIGN_PREFERENCE_PREFIXES.some((prefix) => p.startsWith(prefix))) return 'benign_preference';
    if (PROJECT_CONTEXT_PREFIXES.some((prefix) => p.startsWith(prefix))) return 'project_context';
    return 'unclassified';
}

export function decideMemoryPersistence(input: MemoryPersistenceDecisionInput): MemoryPersistenceOutcome {
    if (input.sensitivity === 'restricted') {
        // 'restricted' sólo se escribe con confirmación humana explícita
        // (extractionMethod='manual') -- una extracción automática (llm o
        // deterministic) de un hecho restringido NUNCA se auto-persiste.
        return input.extractionMethod === 'manual' ? 'requires_confirmation' : 'never_store';
    }

    if (input.sensitivity === 'sensitive') {
        // Sensible-no-restringido: NUNCA auto-activo de inmediato. Identidad
        // no resuelta sobre un hecho sensible es doblemente incierto -> ni
        // siquiera candidate esperando confirmación, se descarta explícito.
        if (!input.identityResolved) return 'requires_confirmation';
        if (input.extractionMethod === 'llm' && input.confidence < LOW_CONFIDENCE_THRESHOLD) return 'requires_confirmation';
        return 'candidate_only';
    }

    // sensitivity === 'normal' -- CIERRE DEL BLOCKER A: esto YA NO implica
    // auto_store por sí solo. "normal" sólo significa "el detector de
    // palabras clave no encontró nada" -- nunca "confirmado seguro".
    if (!input.identityResolved) return 'candidate_only';
    if (input.extractionMethod === 'llm' && input.confidence < LOW_CONFIDENCE_THRESHOLD) return 'candidate_only';

    const riskCategory = classifyMemoryRiskCategory(input.predicate, input.extractionMethod);
    if (riskCategory === 'canonical_event_history' || riskCategory === 'benign_preference' || riskCategory === 'project_context') {
        return 'auto_store';
    }
    // 'unclassified': sensibilidad='normal' pero la categoría del hecho no
    // está en ningún allowlist conocido de bajo riesgo -- el Core nunca
    // trata "no until encontré una razón para sospechar" como "es seguro
    // persistir de forma durable y automática". Éste es exactamente el caso
    // D del ticket (hecho muy personal con redacción novedosa que ninguna
    // keyword detecta) -- classifySensitivity no lo marcó, pero tampoco
    // calificó para el allowlist, así que nunca llega a auto_store.
    return 'candidate_only';
}
