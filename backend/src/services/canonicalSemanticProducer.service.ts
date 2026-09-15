import OpenAI from 'openai';
import { z } from 'zod';
import { isAiConfigured } from './synthesis.service';
import { normalizeSemanticTurnV2 } from './agentTurnSemanticV2.service';
import { AGENT_TURN_SEMANTIC_V2, type NormalizedSemanticTurnV2, type NormalizedSemanticTurnV3, type TemporalFactV3 } from '../types/agentTurnCommit';

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
    authoritativeSemanticV3?: Omit<NormalizedSemanticTurnV3, 'version'>;
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
    temporalFact: z.unknown().optional(),
}).strict();

const temporalFactSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('absolute_date'), precision: z.literal('date'), year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }),
    z.object({ kind: z.literal('absolute_datetime'), precision: z.enum(['minute', 'second']), year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), second: z.number().int().min(0).max(59).optional(), meridiem: z.enum(['24h', 'am', 'pm']) }),
    z.object({ kind: z.literal('relative_date'), precision: z.literal('date'), amount: z.number().int().positive().max(366), unit: z.enum(['days', 'weeks']) }),
    z.object({ kind: z.literal('relative_target_offset'), precision: z.literal('elapsed'), amount: z.number().int().positive().max(100000), unit: z.enum(['minutes', 'hours', 'days', 'weeks']) }),
    z.object({ kind: z.literal('relative_duration'), precision: z.literal('duration'), amount: z.number().int().positive().max(100000), unit: z.enum(['minutes', 'hours', 'days', 'weeks']) }),
    z.object({ kind: z.literal('weekday'), precision: z.literal('date'), weekday: z.number().int().min(0).max(6), relation: z.enum(['this_or_next', 'next']) }),
    z.object({ kind: z.literal('time_only'), precision: z.enum(['minute', 'second']), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), second: z.number().int().min(0).max(59).optional(), meridiem: z.enum(['24h', 'am', 'pm', 'unknown']), ambiguity: z.enum(['none', 'clock']) }),
]);

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

    public async produceV3(input: CanonicalSemanticProducerInput): Promise<NormalizedSemanticTurnV3> {
        if (input.authoritativeSemanticV3) return { version: 3, ...input.authoritativeSemanticV3 };
        try {
            const raw = await this.model.interpret({ ...input, dialogue: input.dialogue ?? null });
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const base = outputSchema.safeParse(parsed);
            if (!base.success) return { version: 3, ...unknownTurnV3() };
            const temporal = temporalFactSchema.safeParse((parsed as Record<string, unknown>).temporalFact);
            if ((parsed as Record<string, unknown>).temporalFact !== undefined && !temporal.success) return { version: 3, ...unknownTurnV3() };
            const { temporalFact: _rawTemporal, ...baseData } = base.data;
            return normalizeV3({ ...baseData, version: 3, source: 'llm', ...(temporal.success ? { temporalFact: temporal.data as TemporalFactV3 } : {}) });
        } catch { return { version: 3, ...unknownTurnV3() }; }
    }
}

function unknownTurnV3(): Omit<NormalizedSemanticTurnV3, 'version'> {
    return { kind: 'unknown', domain: 'unknown', objectiveCompleteness: 'unknown', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'unknown', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'unknown', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: ['semantic_interpretation'], confidence: 0, source: 'fallback' };
}

function normalizeV3(input: NormalizedSemanticTurnV3): NormalizedSemanticTurnV3 {
    if (input.version !== 3 || JSON.stringify(input).length > 32 * 1024) return { version: 3, ...unknownTurnV3() };
    return JSON.parse(JSON.stringify(input)) as NormalizedSemanticTurnV3;
}

export const canonicalSemanticProducer = new CanonicalSemanticProducer();
