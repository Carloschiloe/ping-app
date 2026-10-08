import {
    LlmInputInterpreter, OpenAiAgentInputModel,
    type AgentInputInterpreter, type AgentInputProviderErrorMetadata, type AgentInputProviderResponseMetadata,
} from '../src/services/agentInputInterpreter.service';
import {
    LlmObjectiveInterpreter, OpenAiAgentObjectiveModel,
    type AgentObjectiveInterpreter, type AgentObjectiveProviderErrorMetadata, type AgentObjectiveProviderResponseMetadata,
} from '../src/services/agentObjectiveInterpreter.service';
import type { SemanticModelFamily } from '../src/services/semanticOpenAiTransport.service';

export type SemanticProviderResult = 'response' | 'fallback';
export interface ProductSemanticCallRecord {
    modelRequested: string; modelActual: string | null; providerResult: SemanticProviderResult;
    fallbackUsed: boolean; fallbackReason: string | null; providerErrorClass: string | null;
    providerHttpStatus: number | null; providerErrorCode: string | null; providerErrorType: string | null;
    finishReason: string | null; contentPresent: boolean | null; latencyMs: number;
    inputTokens: number | null; outputTokens: number | null; reasoningTokens: number | null; cachedInputTokens: number | null;
}
export interface ProductSemanticTelemetry { input: ProductSemanticCallRecord[]; objective: ProductSemanticCallRecord[]; }
export interface ProductSemanticInterpreters {
    inputInterpreter: AgentInputInterpreter; objectiveInterpreter: AgentObjectiveInterpreter; telemetry: ProductSemanticTelemetry;
}

function shift<T>(queue: T[]): T | null { return queue.shift() ?? null; }
function record(model: string, startedAt: number, result: { source?: string; fallbackReason?: string; modelUsed?: string }, metadata: AgentInputProviderResponseMetadata | AgentObjectiveProviderResponseMetadata | null, error: AgentInputProviderErrorMetadata | AgentObjectiveProviderErrorMetadata | null): ProductSemanticCallRecord {
    const fallback = result.source === 'llm_fallback';
    return {
        modelRequested: model, modelActual: metadata?.modelActual ?? (fallback ? null : result.modelUsed ?? null),
        providerResult: fallback ? 'fallback' : 'response', fallbackUsed: fallback,
        fallbackReason: fallback ? result.fallbackReason ?? 'unknown' : null,
        providerErrorClass: error?.providerErrorClass ?? null, providerHttpStatus: error?.providerHttpStatus ?? null,
        providerErrorCode: error?.providerErrorCode ?? null, providerErrorType: error?.providerErrorType ?? null,
        finishReason: metadata?.finishReason ?? null, contentPresent: metadata?.contentPresent ?? null,
        latencyMs: Math.max(0, Date.now() - startedAt), inputTokens: metadata?.inputTokens ?? null,
        outputTokens: metadata?.outputTokens ?? null, reasoningTokens: metadata?.reasoningTokens ?? null,
        cachedInputTokens: metadata?.cachedInputTokens ?? null,
    };
}

export function createProductSemanticInterpreters(modelName: string, telemetry: ProductSemanticTelemetry = { input: [], objective: [] }, modelFamily: SemanticModelFamily = 'modern_reasoning', maxProviderRequests = 3): ProductSemanticInterpreters {
    const inputResponses: AgentInputProviderResponseMetadata[] = [], objectiveResponses: AgentObjectiveProviderResponseMetadata[] = [];
    const inputErrors: AgentInputProviderErrorMetadata[] = [], objectiveErrors: AgentObjectiveProviderErrorMetadata[] = [];
    let started = 0;
    const acquire = () => { if (started >= maxProviderRequests) throw new Error('provider_request_budget_exceeded'); started += 1; };
    const inputModel = new OpenAiAgentInputModel({ modelName, modelFamily, onProviderRequest: acquire, onProviderResponse: m => inputResponses.push(m), onProviderError: e => inputErrors.push(e) });
    const objectiveModel = new OpenAiAgentObjectiveModel({ modelName, modelFamily, onProviderRequest: acquire, onProviderResponse: m => objectiveResponses.push(m), onProviderError: e => objectiveErrors.push(e) });
    const inputBase = new LlmInputInterpreter({ model: inputModel });
    const objectiveBase = new LlmObjectiveInterpreter({ model: objectiveModel });
    const inputInterpreter: AgentInputInterpreter = { async interpret(input, context) { const startedAt = Date.now(); const result = await inputBase.interpret(input, context); telemetry.input.push(record(modelName, startedAt, result, shift(inputResponses), shift(inputErrors))); return result; } };
    const objectiveInterpreter: AgentObjectiveInterpreter = { async interpret(input, context) { const startedAt = Date.now(); const result = await objectiveBase.interpret(input, context); telemetry.objective.push(record(modelName, startedAt, result, shift(objectiveResponses), shift(objectiveErrors))); return result; } };
    return { inputInterpreter, objectiveInterpreter, telemetry };
}

export function providerRequestCount(telemetry: ProductSemanticTelemetry): number { return telemetry.input.length + telemetry.objective.length; }
export function totalTokenUsage(telemetry: ProductSemanticTelemetry) {
    const calls = [...telemetry.input, ...telemetry.objective];
    const sum = (key: 'inputTokens' | 'outputTokens' | 'reasoningTokens' | 'cachedInputTokens') => calls.every(c => c[key] === null) ? null : calls.reduce((total, c) => total + (c[key] ?? 0), 0);
    return { inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), reasoningTokens: sum('reasoningTokens'), cachedInputTokens: sum('cachedInputTokens') };
}
export function estimateProviderCost(telemetry: ProductSemanticTelemetry, rates: { inputUsdPerMillion: number; outputUsdPerMillion: number }): number | null {
    const usage = totalTokenUsage(telemetry); if (usage.inputTokens === null || usage.outputTokens === null) return null;
    return (usage.inputTokens * rates.inputUsdPerMillion + usage.outputTokens * rates.outputUsdPerMillion) / 1_000_000;
}
