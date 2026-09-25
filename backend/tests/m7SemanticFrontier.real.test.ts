import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { CanonicalSemanticProducer, OpenAiSemanticModel } from '../src/services/canonicalSemanticProducer.service';
import { M7_FRONTIER_CASES } from './fixtures/m7SemanticFrontierCases';

if (process.env.M7_FRONTIER_REAL_LLM === '1') dotenv.config();

const REAL = process.env.M7_FRONTIER_REAL_LLM === '1';
const MODEL = process.env.M7_FRONTIER_MODEL?.trim();
const IDS = process.env.M7_FRONTIER_IDS
    ? new Set(process.env.M7_FRONTIER_IDS.split(',').map(v => v.trim()).filter(Boolean))
    : null;

describe.skipIf(!REAL || !MODEL)('M-7 semantic frontier real-model benchmark', () => {
    it('generalizes frozen unseen language without phrase patches', async () => {
        // The benchmark varies only the injected model name. Prompt, provider
        // schema, parser and normalizer are the exact runtime V4 boundary.
        const producer = new CanonicalSemanticProducer(new OpenAiSemanticModel(MODEL!));
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
