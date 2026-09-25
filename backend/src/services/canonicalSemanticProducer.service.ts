import OpenAI from 'openai';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { isAiConfigured } from './synthesis.service';
import { normalizeSemanticTurnV2 } from './agentTurnSemanticV2.service';
import { AGENT_TURN_SEMANTIC_V2, type NormalizedSemanticTurnV2, type NormalizedSemanticTurnV3, type NormalizedSemanticTurnV4, type TemporalFactV3, type SemanticReadMeaningV4 } from '../types/agentTurnCommit';
import { normalizeSemanticTurnV4 } from './agentTurnSemanticV4.service';

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
    authoritativeSemanticV4?: Omit<NormalizedSemanticTurnV4, 'version'>;
}

export interface SemanticModelRequest {
    text: string;
    modality: 'text' | 'voice';
    locale?: string;
    timezone?: string;
    dialogue: SemanticDialogueContext | null;
    semanticVersion?: 4;
}

export interface SemanticModel {
    readonly modelName: string;
    interpret(request: SemanticModelRequest): Promise<unknown>;
}

const semanticScalarSchema = z.union([z.string().max(500), z.number(), z.boolean(), z.null()]);

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

const readMeaningSchema = z.object({
    queryShape: z.enum(['focused', 'collection', 'count']),
    explicitCollection: z.boolean(),
    targetShape: z.enum(['none', 'person', 'commitment', 'proposal', 'message', 'conversation', 'attachment', 'transcription', 'topic']),
    relationship: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('general_recall') }),
        z.object({ kind: z.literal('current_state') }),
        z.object({ kind: z.literal('lifecycle_transition'), transition: z.enum(['action_completed', 'resolved', 'cancelled', 'rejected', 'reopened', 'reassigned', 'accepted']) }),
        z.object({ kind: z.literal('proposal_focus'), focus: z.enum(['waiting_for_others', 'needs_my_response', 'pending_response_from_person']) }),
        z.object({ kind: z.literal('person_relationship') }),
        z.object({ kind: z.literal('message_relationship'), relationship: z.enum(['content', 'conversation_context', 'sender', 'participant']) }),
        z.object({ kind: z.literal('attachment_content') }),
        z.object({ kind: z.literal('transcription_content') }),
    ]),
    temporalRole: z.enum(['none', 'filter_range', 'occurrence_time', 'target_date', 'elapsed', 'duration']),
    commitmentStatus: z.enum(['pending']).nullable().optional(),
}).strict();

const outputSchemaV4 = outputSchema.extend({ readMeaning: readMeaningSchema.nullable() }).strict();

// The canonical runtime shape remains the source of truth. OpenAI's strict
// structured-output subset cannot represent arbitrary object maps reliably,
// so the provider transport represents slots as bounded key/value entries.
// The parser below converts that transport back to the canonical slots map
// before Zod validation and normalization.
const providerTemporalFactSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('absolute_date'), precision: z.literal('date'), year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31) }).strict(),
    z.object({ kind: z.literal('absolute_datetime'), precision: z.enum(['minute', 'second']), year: z.number().int(), month: z.number().int().min(1).max(12), day: z.number().int().min(1).max(31), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), second: z.number().int().min(0).max(59).nullable(), meridiem: z.enum(['24h', 'am', 'pm']) }).strict(),
    z.object({ kind: z.literal('relative_date'), precision: z.literal('date'), amount: z.number().int().positive().max(366), unit: z.enum(['days', 'weeks']) }).strict(),
    z.object({ kind: z.literal('relative_target_offset'), precision: z.literal('elapsed'), amount: z.number().int().positive().max(100000), unit: z.enum(['minutes', 'hours', 'days', 'weeks']) }).strict(),
    z.object({ kind: z.literal('relative_duration'), precision: z.literal('duration'), amount: z.number().int().positive().max(100000), unit: z.enum(['minutes', 'hours', 'days', 'weeks']) }).strict(),
    z.object({ kind: z.literal('weekday'), precision: z.literal('date'), weekday: z.number().int().min(0).max(6), relation: z.enum(['this_or_next', 'next']) }).strict(),
    z.object({ kind: z.literal('time_only'), precision: z.enum(['minute', 'second']), hour: z.number().int().min(0).max(23), minute: z.number().int().min(0).max(59), second: z.number().int().min(0).max(59).nullable(), meridiem: z.enum(['24h', 'am', 'pm', 'unknown']), ambiguity: z.enum(['none', 'clock']) }).strict(),
]);

const providerReadMeaningSchema = z.object({
    queryShape: z.enum(['focused', 'collection', 'count']),
    explicitCollection: z.boolean(),
    targetShape: z.enum(['none', 'person', 'commitment', 'proposal', 'message', 'conversation', 'attachment', 'transcription', 'topic']),
    relationship: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('general_recall') }).strict(),
        z.object({ kind: z.literal('current_state') }).strict(),
        z.object({ kind: z.literal('lifecycle_transition'), transition: z.enum(['action_completed', 'resolved', 'cancelled', 'rejected', 'reopened', 'reassigned', 'accepted']) }).strict(),
        z.object({ kind: z.literal('proposal_focus'), focus: z.enum(['waiting_for_others', 'needs_my_response', 'pending_response_from_person']) }).strict(),
        z.object({ kind: z.literal('person_relationship') }).strict(),
        z.object({ kind: z.literal('message_relationship'), relationship: z.enum(['content', 'conversation_context', 'sender', 'participant']) }).strict(),
        z.object({ kind: z.literal('attachment_content') }).strict(),
        z.object({ kind: z.literal('transcription_content') }).strict(),
    ]),
    temporalRole: z.enum(['none', 'filter_range', 'occurrence_time', 'target_date', 'elapsed', 'duration']),
    commitmentStatus: z.enum(['pending']).nullable(),
}).strict();

const providerSlotSchema = z.object({ key: z.string().max(80), value: semanticScalarSchema }).strict();
const providerOutputSchemaV4 = z.object({
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
    slots: z.array(providerSlotSchema).max(50),
    ambiguityFields: z.array(z.string().max(80)).max(10),
    confidence: z.number().min(0).max(1),
    temporalFact: providerTemporalFactSchema.nullable(),
    readMeaning: providerReadMeaningSchema.nullable(),
}).strict();

type JsonSchema = Record<string, any>;

function providerJsonSchema(): JsonSchema {
    const generated = z.toJSONSchema(providerOutputSchemaV4, { target: 'draft-7' }) as JsonSchema;
    const rewrite = (value: unknown, path: string): JsonSchema | unknown => {
        if (Array.isArray(value)) return value.map((item, index) => rewrite(item, `${path}[${index}]`));
        if (!value || typeof value !== 'object') return value;
        const source = value as JsonSchema;
        const result: JsonSchema = {};
        for (const [key, child] of Object.entries(source)) {
            if (key === '$schema') continue;
            if (key === 'oneOf') {
                const branches = child as JsonSchema[];
                const discriminators = branches.map((branch) => branch?.properties?.kind?.const);
                if (branches.length === 0 || discriminators.some((item) => typeof item !== 'string')
                    || new Set(discriminators).size !== discriminators.length) {
                    throw new Error(`Semantic V4 provider union is not safely discriminated at ${path}`);
                }
                result.anyOf = branches.map((branch, index) => rewrite(branch, `${path}.anyOf[${index}]`));
                continue;
            }
            result[key] = rewrite(child, `${path}.${key}`);
        }
        if (result.type === 'object' && result.properties && typeof result.properties === 'object') {
            result.additionalProperties = false;
            result.required = Object.keys(result.properties);
        }
        return result;
    };
    const schema = rewrite(generated, 'root') as JsonSchema;
    if (schema.type !== 'object' || schema.additionalProperties !== false || !Array.isArray(schema.required)) {
        throw new Error('Semantic V4 provider schema must be a strict root object');
    }
    return schema;
}

export const SEMANTIC_V4_PROVIDER_SCHEMA = providerJsonSchema();
export const SEMANTIC_V4_PROVIDER_SCHEMA_HASH = createHash('sha256')
    .update(JSON.stringify(SEMANTIC_V4_PROVIDER_SCHEMA), 'utf8')
    .digest('hex');
export const SEMANTIC_V4_PROVIDER_SCHEMA_NAME = 'ping_semantic_turn_v4';

const MODEL_NAME = 'gpt-4o-mini';
let client: OpenAI | null = null;
function openAi(): OpenAI { return client ?? (client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })); }

export function buildSemanticV4Prompt(request: SemanticModelRequest): string {
    return [
        'Interpret one Ping turn into semantic facts only. Do not decide disposition, identity, authorization, execution, or mutation.',
        'Return exactly the JSON fields in the supplied contract. Preserve unknown and ambiguity; never guess.',
        'A complete independent objective must not be represented as a slot answer. A bare value may be a slot answer only when dialogue context supports it.',
        'Lifecycle command means conversational abandon/resume only when the language and context support that reading; ambiguous cancel language must remain lifecycleEvidence=unknown.',
        'The provider transport uses slots as an array of {key,value}; the runtime parser converts it to the canonical slots map. temporalFact and readMeaning are always present and use null when absent.',
        `Provider schema hash: ${SEMANTIC_V4_PROVIDER_SCHEMA_HASH}`,
        `Input modality: ${request.modality}; locale: ${request.locale ?? 'unknown'}; timezone: ${request.timezone ?? 'unknown'}`,
        `Bounded dialogue context: ${JSON.stringify(request.dialogue)}`,
        `User turn: ${request.text}`,
    ].join('\n');
}

export class OpenAiSemanticModel implements SemanticModel {
    readonly modelName: string;
    public constructor(modelName = MODEL_NAME) { this.modelName = modelName; }
    async interpret(request: SemanticModelRequest): Promise<unknown> {
        if (!isAiConfigured()) throw new Error('OPENAI_API_KEY is not configured');
        const isV4 = request.semanticVersion === 4;
        const response = await openAi().chat.completions.create({
            model: this.modelName, messages: [{ role: 'user', content: isV4 ? buildSemanticV4Prompt(request) : buildLegacySemanticPrompt(request) }],
            temperature: 0.1, max_tokens: 450,
            response_format: isV4
                ? { type: 'json_schema', json_schema: { name: SEMANTIC_V4_PROVIDER_SCHEMA_NAME, strict: true, schema: SEMANTIC_V4_PROVIDER_SCHEMA } }
                : { type: 'json_object' },
        } as any);
        return JSON.parse(response.choices[0]?.message?.content ?? '{}');
    }
}

function buildLegacySemanticPrompt(request: SemanticModelRequest): string {
    return [
        'Interpret one Ping turn into semantic facts only. Do not decide identity, authorization, execution, or mutation.',
        'Return exactly the legacy semantic fields requested by the caller. Preserve unknown and ambiguity; never guess.',
        `Input modality: ${request.modality}; locale: ${request.locale ?? 'unknown'}; timezone: ${request.timezone ?? 'unknown'}`,
        `Bounded dialogue context: ${JSON.stringify(request.dialogue)}`,
        `User turn: ${request.text}`,
    ].join('\n');
}

export type SemanticV4ParseFailure = 'invalid_json' | 'schema_invalid';
export interface SemanticV4ParseDiagnostics {
    schemaValid: boolean;
    failure: SemanticV4ParseFailure | null;
}

function canonicalizeProviderPayload(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const record = { ...(value as Record<string, unknown>) };
    if (Array.isArray(record.slots)) {
        const slots: Record<string, string | number | boolean | null> = {};
        for (const entry of record.slots) {
            if (!entry || typeof entry !== 'object') continue;
            const item = entry as Record<string, unknown>;
            if (typeof item.key === 'string') slots[item.key] = item.value as string | number | boolean | null;
        }
        record.slots = slots;
    }
    for (const key of ['temporalFact']) {
        const fact = record[key];
        if (fact === null) {
            delete record[key];
            continue;
        }
        if (fact && typeof fact === 'object' && (fact as Record<string, unknown>).second === null) {
            record[key] = { ...(fact as Record<string, unknown>) };
            delete (record[key] as Record<string, unknown>).second;
        }
    }
    return record;
}

export function parseSemanticV4ModelOutput(raw: unknown): { semantic: NormalizedSemanticTurnV4; diagnostics: SemanticV4ParseDiagnostics } {
    let parsed: unknown;
    try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch { return { semantic: unknownTurnV4(), diagnostics: { schemaValid: false, failure: 'invalid_json' } }; }
    const canonical = outputSchemaV4.safeParse(canonicalizeProviderPayload(parsed));
    const provider = providerOutputSchemaV4.safeParse(parsed);
    if (!canonical.success) return { semantic: unknownTurnV4(), diagnostics: { schemaValid: false, failure: 'schema_invalid' } };
    const temporal = temporalFactSchema.safeParse((canonical.data as Record<string, unknown>).temporalFact);
    if ((canonical.data as Record<string, unknown>).temporalFact !== undefined && !temporal.success) {
        return { semantic: unknownTurnV4(), diagnostics: { schemaValid: false, failure: 'schema_invalid' } };
    }
    const { temporalFact: _rawTemporal, readMeaning, ...baseData } = canonical.data;
    return {
        semantic: normalizeSemanticTurnV4({ ...baseData, version: 4, source: 'llm', readMeaning: readMeaning as SemanticReadMeaningV4 | null, ...(temporal.success ? { temporalFact: temporal.data as TemporalFactV3 } : {}) }),
        diagnostics: { schemaValid: provider.success, failure: provider.success ? null : 'schema_invalid' },
    };
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

    public get modelName(): string { return this.model.modelName; }

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
            const raw = await this.model.interpret({ ...input, dialogue: input.dialogue ?? null, semanticVersion: 4 });
            const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
            const base = outputSchema.safeParse(parsed);
            if (!base.success) return { version: 3, ...unknownTurnV3() };
            const temporal = temporalFactSchema.safeParse((parsed as Record<string, unknown>).temporalFact);
            if ((parsed as Record<string, unknown>).temporalFact !== undefined && !temporal.success) return { version: 3, ...unknownTurnV3() };
            const { temporalFact: _rawTemporal, ...baseData } = base.data;
            return normalizeV3({ ...baseData, version: 3, source: 'llm', ...(temporal.success ? { temporalFact: temporal.data as TemporalFactV3 } : {}) });
        } catch { return { version: 3, ...unknownTurnV3() }; }
    }

    public async produceV4(input: CanonicalSemanticProducerInput): Promise<NormalizedSemanticTurnV4> {
        return (await this.produceV4WithDiagnostics(input)).semantic;
    }

    public async produceV4WithDiagnostics(input: CanonicalSemanticProducerInput): Promise<{ semantic: NormalizedSemanticTurnV4; diagnostics: SemanticV4ParseDiagnostics & { providerFailure: boolean } }> {
        if (input.authoritativeSemanticV4) return {
            semantic: normalizeSemanticTurnV4({ version: 4, ...input.authoritativeSemanticV4 }),
            diagnostics: { schemaValid: true, failure: null, providerFailure: false },
        };
        try {
            const raw = await this.model.interpret({ ...input, dialogue: input.dialogue ?? null, semanticVersion: 4 });
            const parsed = parseSemanticV4ModelOutput(raw);
            return { ...parsed, diagnostics: { ...parsed.diagnostics, providerFailure: false } };
        } catch { return { semantic: unknownTurnV4(), diagnostics: { schemaValid: false, failure: null, providerFailure: true } }; }
    }
}

function unknownTurnV3(): Omit<NormalizedSemanticTurnV3, 'version'> {
    return { kind: 'unknown', domain: 'unknown', objectiveCompleteness: 'unknown', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'unknown', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'unknown', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: ['semantic_interpretation'], confidence: 0, source: 'fallback' };
}

function normalizeV3(input: NormalizedSemanticTurnV3): NormalizedSemanticTurnV3 {
    if (input.version !== 3 || JSON.stringify(input).length > 32 * 1024) return { version: 3, ...unknownTurnV3() };
    return JSON.parse(JSON.stringify(input)) as NormalizedSemanticTurnV3;
}

function unknownTurnV4(): NormalizedSemanticTurnV4 {
    return { version: 4, kind: 'unknown', domain: 'unknown', objectiveCompleteness: 'unknown', lifecycleCommand: 'none', lifecycleTarget: 'unspecified', lifecycleEvidence: 'unknown', pendingSlotAnswer: 'unknown', continuationLike: 'unknown', candidateSlotType: null, independentObjective: 'unknown', objectiveType: null, entityHints: [], slots: {}, ambiguityFields: ['semantic_interpretation'], confidence: 0, source: 'fallback', readMeaning: null };
}

export const canonicalSemanticProducer = new CanonicalSemanticProducer();
