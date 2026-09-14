import OpenAI from 'openai';
import { z } from 'zod';
import { isAiConfigured } from './synthesis.service';
import { normalizeSemanticTurnV2 } from './agentTurnSemanticV2.service';
import { AGENT_TURN_SEMANTIC_V2, type NormalizedSemanticTurnV2 } from '../types/agentTurnCommit';

export interface SemanticDialogueContext {
    lifecycle: 'none' | 'active' | 'suspended' | 'active_and_suspended';
    activeObjectiveType: string | null;
    missingSlotType: string | null;
    suspendedObjectiveType: string | null;
    referentHints: string[];
}

export interface CanonicalSemanticProducerInput {
    text: string;
    modality: 'text' | 'voice';
    locale?: string;
    timezone?: string;
    dialogue?: SemanticDialogueContext | null;
    authoritativeSemantic?: Omit<NormalizedSemanticTurnV2, 'version'>;
}

export interface SemanticModelRequest {
    text: string;
    modality: 'text' | 'voice';
    locale?: string;
    timezone?: string;
    dialogue: SemanticDialogueContext | null;
}

export interface SemanticModel {
    readonly modelName: string;
    interpret(request: SemanticModelRequest): Promise<unknown>;
}

const outputSchema = z.object({
    kind: z.enum(['read_request', 'write_request', 'slot_answer', 'lifecycle_command', 'unknown']),
    domain: z.enum(['commitment', 'messaging', 'people', 'historical_read', 'generic', 'unknown']),
    objectiveCompleteness: z.enum(['complete', 'incomplete', 'unknown']),
    lifecycleCommand: z.enum(['none', 'abandon', 'resume']),
    lifecycleTarget: z.enum(['active', 'suspended', 'unspecified']),
    lifecycleEvidence: z.enum(['explicit', 'implicit', 'unknown']),
    pendingSlotAnswer: z.enum(['likely', 'not_a_slot_answer', 'unknown']),
    continuationLike: z.enum(['yes', 'no', 'unknown']),
    candidateSlotType: z.string().max(80).nullable(),
    independentObjective: z.enum(['yes', 'no', 'unknown']),
    objectiveType: z.string().max(120).nullable(),
    entityHints: z.array(z.string().max(200)).max(10),
    slots: z.record(z.string().max(80), z.union([z.string().max(500), z.number(), z.boolean(), z.null()])).default({}),
    ambiguityFields: z.array(z.string().max(80)).max(10),
    confidence: z.number().min(0).max(1),
}).strict();

const MODEL_NAME = 'gpt-4o-mini';
let client: OpenAI | null = null;
function openAi(): OpenAI { return client ?? (client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })); }

function buildPrompt(request: SemanticModelRequest): string {
    return [
        'Interpret one Ping turn into semantic facts only. Do not decide disposition, identity, authorization, execution, or mutation.',
        'Return exactly the JSON fields in the supplied contract. Preserve unknown and ambiguity; never guess.',
        'A complete independent objective must not be represented as a slot answer. A bare value may be a slot answer only when dialogue context supports it.',
        'Lifecycle command means conversational abandon/resume only when the language and context support that reading; ambiguous cancel language must remain lifecycleEvidence=unknown.',
        'Contract: {kind,domain,objectiveCompleteness,lifecycleCommand,lifecycleTarget,lifecycleEvidence,pendingSlotAnswer,continuationLike,candidateSlotType,independentObjective,objectiveType,entityHints,slots,ambiguityFields,confidence}',
        `Input modality: ${request.modality}; locale: ${request.locale ?? 'unknown'}; timezone: ${request.timezone ?? 'unknown'}`,
        `Bounded dialogue context: ${JSON.stringify(request.dialogue)}`,
        `User turn: ${request.text}`,
    ].join('\n');
}

class OpenAiSemanticModel implements SemanticModel {
    readonly modelName = MODEL_NAME;
    async interpret(request: SemanticModelRequest): Promise<unknown> {
        if (!isAiConfigured()) throw new Error('OPENAI_API_KEY is not configured');
        const response = await openAi().chat.completions.create({
            model: MODEL_NAME, messages: [{ role: 'user', content: buildPrompt(request) }],
            temperature: 0.1, max_tokens: 350, response_format: { type: 'json_object' },
        });
        return JSON.parse(response.choices[0]?.message?.content ?? '{}');
    }
}

function unknownTurn(): NormalizedSemanticTurnV2 {
    return {
        version: AGENT_TURN_SEMANTIC_V2, kind: 'unknown', domain: 'unknown', objectiveCompleteness: 'unknown',
        lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown',
        pendingSlotAnswer: 'unknown', continuationLike: 'unknown', candidateSlotType: null,
        independentObjective: 'unknown', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: ['semantic_interpretation'],
        confidence: 0, source: 'fallback',
    };
}

export class CanonicalSemanticProducer {
    public constructor(private readonly model: SemanticModel = new OpenAiSemanticModel()) {}

    public async produce(input: CanonicalSemanticProducerInput): Promise<NormalizedSemanticTurnV2> {
        if (input.authoritativeSemantic) return normalizeSemanticTurnV2({ version: 2, ...input.authoritativeSemantic });
        try {
            const raw = await this.model.interpret({ ...input, dialogue: input.dialogue ?? null });
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const result = outputSchema.safeParse(parsed);
            if (!result.success) return unknownTurn();
            return normalizeSemanticTurnV2({ ...result.data, version: 2, source: 'llm' });
        } catch {
            return unknownTurn();
        }
    }
}

export const canonicalSemanticProducer = new CanonicalSemanticProducer();
