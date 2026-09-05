// M-1F — Agent Orchestrator.
//
// Une las capas canónicas ya existentes y certificadas — nunca reimplementa
// ninguna de ellas (sección 1): interpretation/entity/time resolution y
// retrieval autorizada viven en `buildAgentContext` (M-1D/M-1D.1, sobre
// M-1B/M-1C); síntesis/claim-validation/provenance viven en
// `synthesizeAgentResponse` (M-1E/M-1E.1). Este archivo sólo compone las dos
// llamadas y agrega timing.
//
// Transport-agnostic (sección 38): no importa nada de Express, no conoce
// HTTP. El mismo `runAgent` podrá invocarse desde un futuro pipeline de voz
// u otro dispositivo sin cambios — el controller HTTP es sólo un adapter.
//
// Nunca consulta la base de datos directamente (sección 3) — no importa
// `supabaseAdmin` ni ninguna función de `retrieval.service.ts`; delega
// TODO acceso a datos a `buildAgentContext`.
import { buildAgentContext, type BuildAgentContextOptions } from './agentContextBuilder.service';
import { synthesizeAgentResponse } from './agentResponseSynthesizer.service';
import type { AgentContextInput } from '../types/agentContext';
import type { AgentOrchestratorInput, AgentOrchestratorResponse } from '../types/agent';
import type { AgentResponseSynthesizer } from './agentResponseSynthesizer.service';

export interface RunAgentOptions {
    interpreter?: BuildAgentContextOptions['interpreter'];
    contextBudget?: BuildAgentContextOptions['budget'];
    synthesizer?: AgentResponseSynthesizer;
}

// Cost control (sección 29): como máximo 1 llamada LLM de interpretación
// (dentro de buildAgentContext) + 1 de síntesis (dentro de
// synthesizeAgentResponse, y sólo si status=answered) — nunca una tercera
// llamada agregada aquí. El orquestador mismo no llama a ningún modelo.
export async function runAgent(input: AgentOrchestratorInput, options: RunAgentOptions = {}): Promise<AgentOrchestratorResponse> {
    const startedAt = Date.now();

    const contextInput: AgentContextInput = {
        actorUserId: input.actorUserId,
        input: input.input,
        conversationId: input.conversationId,
        channel: input.channel,
        locale: input.locale,
        timezone: input.timezone,
        now: input.now,
    };

    const contextStart = Date.now();
    // Cualquier error de autorización (ej. conversationId ajeno -> 403) se
    // propaga tal cual — nunca se traga aquí (sección 9).
    const context = await buildAgentContext(contextInput, { interpreter: options.interpreter, budget: options.contextBudget });
    const contextBuildMs = Date.now() - contextStart;

    const synthesisStart = Date.now();
    const response = await synthesizeAgentResponse(
        { input: input.input, context, locale: input.locale, channel: input.channel },
        { synthesizer: options.synthesizer },
    );
    const synthesisMs = Date.now() - synthesisStart;

    return {
        ...response,
        diagnostics: response.diagnostics
            ? { ...response.diagnostics, contextBuildMs, synthesisMs, totalMs: Date.now() - startedAt }
            : undefined,
    };
}
