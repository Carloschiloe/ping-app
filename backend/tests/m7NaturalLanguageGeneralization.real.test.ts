import { describe, expect, it } from 'vitest';
import dotenv from 'dotenv';
import { M7_NATURAL_LANGUAGE_CASES } from './fixtures/m7NaturalLanguageCases';
import { interpretAgentSemanticTurn } from '../src/services/agentSemanticInterpreter.service';

// This certification is opt-in and loads only the local staging test
// environment. Ordinary unit tests never load provider credentials.
if (process.env.M7_REAL_LLM === '1') dotenv.config();

const ACTOR = '00000000-0000-0000-0000-000000000001';
const REAL_LLM = process.env.M7_REAL_LLM === '1';
const SELECTED_IDS = process.env.M7_REAL_LLM_IDS
    ? new Set(process.env.M7_REAL_LLM_IDS.split(',').map((value) => value.trim()).filter(Boolean))
    : null;

/**
 * Real-provider certification. It is opt-in so ordinary unit runs never
 * spend provider credits. The M-7 run explicitly enables it and records any
 * skipped run as NOT VERIFIED rather than PASS.
 */
describe.skipIf(!REAL_LLM)('M-7 real LLM generalization battery', () => {
    it('classifies all manifest expressions without production phrase patches', async () => {
        const failures: Array<{ id: string; utterance: string; expected: string; observed: string }> = [];
        const batchSize = 4;
        const cases = SELECTED_IDS
            ? M7_NATURAL_LANGUAGE_CASES.filter((item) => SELECTED_IDS.has(item.id))
            : M7_NATURAL_LANGUAGE_CASES;
        for (let offset = 0; offset < cases.length; offset += batchSize) {
            const batch = cases.slice(offset, offset + batchSize);
            const results = await Promise.all(batch.map(async (item) => {
                const result = await interpretAgentSemanticTurn(item.utterance, { actorUserId: ACTOR });
                const expectedRoute = item.expectedRoute ?? (item.expectedClass === 'write' ? 'write' : 'read');
                const objective = result.objective?.objectiveType ?? null;
                const objectiveMatches = !item.expectedObjective || objective === item.expectedObjective;
                if (result.route !== expectedRoute || !objectiveMatches) {
                    return {
                        id: item.id,
                        utterance: item.utterance,
                        expected: `${expectedRoute}/${item.expectedObjective ?? '-'}`,
                        observed: `${result.route}/${objective ?? '-'} [input:${result.interpretation.source}; objective:${result.objective?.source ?? '-'}]`,
                    };
                }
                return null;
            }));
            failures.push(...results.filter((value): value is NonNullable<typeof value> => value !== null));
        }

        expect(
            {
                failureCount: failures.length,
                firstFailures: failures.slice(0, 20),
            },
            'The real-provider battery must have zero mismatches; only the first 20 are shown.',
        ).toEqual({ failureCount: 0, firstFailures: [] });
    }, 900000);
});
