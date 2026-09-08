import { randomUUID } from 'node:crypto';
import type { AgentOutputEnvelope } from '../types/agentInput';

export interface SpeechSynthesisProvider {
    readonly providerId: string;
    synthesize(input: { text: string; locale?: string }): Promise<{ speechRef: string }>;
}

export function createAgentOutputEnvelope(inputId: string, responseText: string, now = new Date()): AgentOutputEnvelope {
    return {
        outputId: randomUUID(),
        inputId,
        text: responseText,
        modalities: ['text'],
        speechRef: null,
        createdAt: now.toISOString(),
        provenance: { semanticSource: 'agent_response_text' },
    };
}

export async function renderSpeechFromCanonicalText(
    envelope: AgentOutputEnvelope,
    provider: SpeechSynthesisProvider,
    locale?: string,
): Promise<AgentOutputEnvelope> {
    const rendered = await provider.synthesize({ text: envelope.text, locale });
    return { ...envelope, modalities: ['text', 'speech'], speechRef: rendered.speechRef };
}
