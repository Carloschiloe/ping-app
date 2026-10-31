// OpenAI Responses adapter for the assistant. Current reasoning models only
// accept function tools through /v1/responses. The model name comes only
// from the environment; a slow request is hedged like the other semantic
// calls. Nothing is stored at the provider (store: false).
import OpenAI from 'openai';
import { hedgedSemanticRequest, traceSemanticProvider } from '../semanticOpenAiTransport.service';
import type { AssistantChatMessage, AssistantModel, AssistantModelResponse, AssistantToolDefinition } from './assistantTypes';

const TIMEOUT_MS = 20_000;
const HEDGE_AFTER_MS = 8_000;

type ResponseInputItem = Record<string, unknown>;

/** Neutral chat history -> Responses input items. */
export function toResponsesInput(messages: AssistantChatMessage[]): ResponseInputItem[] {
    const items: ResponseInputItem[] = [];
    for (const message of messages) {
        if (message.role === 'tool') {
            items.push({ type: 'function_call_output', call_id: message.tool_call_id, output: message.content });
            continue;
        }
        if (message.role === 'assistant') {
            if (message.content) items.push({ role: 'assistant', content: message.content });
            for (const call of message.tool_calls ?? []) {
                items.push({ type: 'function_call', call_id: call.id, name: call.function.name, arguments: call.function.arguments });
            }
            continue;
        }
        items.push({ role: message.role === 'system' ? 'developer' : 'user', content: message.content });
    }
    return items;
}

export class OpenAiAssistantModel implements AssistantModel {
    private readonly client: OpenAI;

    public constructor(public readonly modelName: string, apiKey = process.env.OPENAI_API_KEY) {
        this.client = new OpenAI({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 });
    }

    async complete(messages: AssistantChatMessage[], tools: AssistantToolDefinition[]): Promise<AssistantModelResponse> {
        const payload = {
            model: this.modelName,
            input: toResponsesInput(messages),
            tools: tools.map((definition) => ({ type: 'function', ...definition.function })),
            tool_choice: 'auto',
            parallel_tool_calls: true,
            reasoning: { effort: 'low' },
            max_output_tokens: 2000,
            store: false,
        } as unknown as OpenAI.Responses.ResponseCreateParamsNonStreaming;
        const response = await hedgedSemanticRequest(
            (signal) => this.client.responses.create(payload, { signal }),
            { hedgeAfterMs: HEDGE_AFTER_MS, onHedge: () => traceSemanticProvider('ASSISTANT_PROVIDER_HEDGE', { modelRequested: this.modelName }) },
        );
        const toolCalls = response.output
            .filter((item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === 'function_call')
            .map((item) => ({ id: item.call_id, type: 'function' as const, function: { name: item.name, arguments: item.arguments } }));
        return { content: response.output_text || null, toolCalls };
    }
}

/** The assistant runs only when a model is configured for it. */
export function assistantModelFromEnv(): OpenAiAssistantModel | null {
    const modelName = process.env.PING_ASSISTANT_MODEL?.trim();
    return modelName ? new OpenAiAssistantModel(modelName) : null;
}
