import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import OpenAI from 'openai';
import { CanonicalSemanticProducer, type SemanticModel, type SemanticModelRequest } from '../src/services/canonicalSemanticProducer.service';
import { M7_FRONTIER_CASES } from './fixtures/m7SemanticFrontierCases';

if (process.env.M7_FRONTIER_REAL_LLM === '1') dotenv.config();

const REAL = process.env.M7_FRONTIER_REAL_LLM === '1';
const MODEL = process.env.M7_FRONTIER_MODEL?.trim();
const IDS = process.env.M7_FRONTIER_IDS
    ? new Set(process.env.M7_FRONTIER_IDS.split(',').map(v => v.trim()).filter(Boolean))
    : null;

class CandidateModel implements SemanticModel {
    readonly modelName: string;
    private readonly client: OpenAI;
    constructor(modelName: string) {
        this.modelName = modelName;
        this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    async interpret(request: SemanticModelRequest): Promise<unknown> {
        const prompt = [
            'Interpret one Ping turn into semantic facts only. Do not decide identity, authorization, execution, or mutation.',
            'Preserve unknown and ambiguity; never guess. Meaning matters, not memorized wording.',
            'Return JSON only with: kind,domain,objectiveCompleteness,lifecycleCommand,lifecycleTarget,lifecycleEvidence,pendingSlotAnswer,continuationLike,candidateSlotType,independentObjective,objectiveType,entityHints,slots,ambiguityFields,confidence,temporalFact,readMeaning.',
            'kind: read_request|write_request|slot_answer|lifecycle_command|unknown.',
            'domain: commitment|messaging|people|historical_read|generic|unknown.',
            'For ambiguity use unknown rather than inventing an action.',
            `Context: ${JSON.stringify(request.dialogue)}`,
            `User turn: ${request.text}`,
        ].join('\n');
        const response = await this.client.chat.completions.create({
            model: this.modelName,
            messages: [{ role:'user', content:prompt }],
            temperature: 0,
            max_tokens: 450,
            response_format: { type:'json_object' },
        });
        return JSON.parse(response.choices[0]?.message?.content ?? '{}');
    }
}

describe.skipIf(!REAL || !MODEL)('M-7 semantic frontier real-model benchmark', () => {
    it('generalizes frozen unseen language without phrase patches', async () => {
        const producer = new CanonicalSemanticProducer(new CandidateModel(MODEL!));
        const cases = IDS ? M7_FRONTIER_CASES.filter(c => IDS.has(c.id)) : M7_FRONTIER_CASES;
        const failures: unknown[] = [];
        for (const c of cases) {
            const got = await producer.produceV4({ text:c.utterance, modality:'text', locale:'es-CL', timezone:'America/Santiago', dialogue:c.dialogue ?? null });
            const e = c.expected;
            const mismatch =
                got.kind !== e.kind ||
                (e.domain !== undefined && got.domain !== e.domain) ||
                (e.objectiveType !== undefined && got.objectiveType !== e.objectiveType) ||
                (e.independentObjective !== undefined && got.independentObjective !== e.independentObjective) ||
                (e.continuationLike !== undefined && got.continuationLike !== e.continuationLike) ||
                (e.lifecycleCommand !== undefined && got.lifecycleCommand !== e.lifecycleCommand);
            if (mismatch) failures.push({ id:c.id, utterance:c.utterance, expected:e, observed:got });
        }
        expect({ failureCount: failures.length, failures }).toEqual({ failureCount:0, failures:[] });
    }, 900000);
});
