import type { NormalizedSemanticTurnV4 } from '../types/agentTurnCommit';
import type { AgentSemanticInterpretation } from './agentSemanticInterpreter.service';
import { getEnvConfig } from '../config/env';
import { canonicalSemanticProducer, type CanonicalSemanticProducer, type SemanticDialogueContext } from './canonicalSemanticProducer.service';

export type SemanticShadowDimension = 'route' | 'objective';
export interface SemanticShadowDifference { dimension: SemanticShadowDimension; legacy: string | null; v4: string | null; }

export interface SemanticShadowTelemetry {
    enabled: boolean;
    model: string | null;
    legacyRoute: string | null;
    v4Kind: string | null;
    legacyObjective: string | null;
    v4Objective: string | null;
    routeAgreement: boolean | null;
    objectiveAgreement: boolean | null;
    v4Confidence: number | null;
    ambiguityCount: number | null;
    schemaValid: boolean | null;
    providerFailure: boolean;
    timeout: boolean;
    failure: string | null;
    latencyMs: number | null;
    differences: SemanticShadowDifference[];
}

export interface SemanticShadowInput {
    legacy: AgentSemanticInterpretation;
    request: {
        text: string;
        modality: 'text' | 'voice';
        locale?: string;
        timezone?: string;
        dialogue?: SemanticDialogueContext | null;
    };
    producer?: Pick<CanonicalSemanticProducer, 'produceV4WithDiagnostics'> & { modelName?: string };
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 3000;

/** Shadow is explicitly opt-in and can never be enabled in production. */
export function isSemanticV4ShadowEnabled(): boolean {
    const environment = getEnvConfig().environmentName;
    return process.env.PING_SEMANTIC_V4_SHADOW === 'true'
        && (environment === 'local' || environment === 'staging')
        && process.env.NODE_ENV !== 'production';
}

function disabledTelemetry(): SemanticShadowTelemetry {
    return {
        enabled: false, model: null, legacyRoute: null, v4Kind: null,
        legacyObjective: null, v4Objective: null, routeAgreement: null,
        objectiveAgreement: null, v4Confidence: null, ambiguityCount: null,
        schemaValid: null, providerFailure: false, timeout: false, failure: null,
        latencyMs: null, differences: [],
    };
}

/**
 * Observational only: this function has no Core/state/writer dependency and
 * returns metrics. The caller must ignore its result for routing/execution.
 */
export async function runSemanticV4Shadow(input: SemanticShadowInput): Promise<SemanticShadowTelemetry> {
    if (!isSemanticV4ShadowEnabled()) return disabledTelemetry();
    const producer = input.producer ?? canonicalSemanticProducer;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
        const result = await Promise.race([
            producer.produceV4WithDiagnostics(input.request),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('semantic_v4_shadow_timeout')), timeoutMs); }),
        ]);
        const differences = compareLegacySemanticToV4(input.legacy, result.semantic);
        return {
            enabled: true,
            model: producer.modelName ?? null,
            legacyRoute: input.legacy.route,
            v4Kind: result.semantic.kind,
            legacyObjective: input.legacy.objective?.objectiveType ?? null,
            v4Objective: result.semantic.objectiveType ?? null,
            routeAgreement: !differences.some((d) => d.dimension === 'route'),
            objectiveAgreement: !differences.some((d) => d.dimension === 'objective'),
            v4Confidence: result.semantic.confidence,
            ambiguityCount: result.semantic.ambiguityFields.length,
            schemaValid: result.diagnostics.schemaValid,
            providerFailure: result.diagnostics.providerFailure,
            timeout: false,
            failure: result.diagnostics.failure,
            latencyMs: Date.now() - started,
            differences,
        };
    } catch (error) {
        const timeout = error instanceof Error && error.message === 'semantic_v4_shadow_timeout';
        return {
            ...disabledTelemetry(), enabled: true, model: producer.modelName ?? null,
            legacyRoute: input.legacy.route, legacyObjective: input.legacy.objective?.objectiveType ?? null,
            schemaValid: false, providerFailure: !timeout, timeout,
            failure: timeout ? 'timeout' : 'provider_failure', latencyMs: Date.now() - started,
        };
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Pure comparison only: cannot route, plan, authorize, or execute. */
export function compareLegacySemanticToV4(legacy: AgentSemanticInterpretation, v4: NormalizedSemanticTurnV4): SemanticShadowDifference[] {
 const out: SemanticShadowDifference[]=[];
 const v4Route=v4.kind==='read_request'?'read':v4.kind==='write_request'?'write':null;
 if(v4Route!==legacy.route) out.push({dimension:'route',legacy:legacy.route,v4:v4Route});
 const legacyObjective=legacy.objective?.objectiveType??null, v4Objective=v4.objectiveType??null;
 if(legacyObjective!==v4Objective) out.push({dimension:'objective',legacy:legacyObjective,v4:v4Objective});
 return out;
}
