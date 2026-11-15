// Real run: sends the 50 invented meetings to real models and scores them.
// It costs money, so it only runs when asked:
//   MEETING_BENCH=1 MEETING_MODELS="openai:gpt-4o,google:gemini-3.5-flash-lite" \
//   MEETING_OUT=/ruta/resultados npx vitest run tests/meetingBench.real.test.ts
import { describe, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MEETING_CASES, MEETING_NOW, MEETING_TIME_ZONE, MEETING_USER, longMeetingCases } from './fixtures/meetingBench';
import { scoreCase, totals } from './support/meetingScorer';
import { analyzeMeeting } from '../src/services/meetings/meetingAnalysis';
import { parseLlmTarget } from '../src/services/meetings/meetingLlm';
import { llmCost } from '../src/services/meetings/meetingPrices';

const enabled = process.env.MEETING_BENCH === '1';
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const p90 = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(s.length * 0.9))] : 0; };

describe.skipIf(!enabled)('meeting analysis with real models', () => {
    it('scores every model on the same 50 meetings', async () => {
        const specs = (process.env.MEETING_MODELS || '').split(',').map((s) => s.trim()).filter(Boolean);
        const outDir = process.env.MEETING_OUT || path.join(process.cwd(), '.meeting-bench');
        const only = process.env.MEETING_ONLY ? process.env.MEETING_ONLY.split(',') : null;
        const parallel = Number(process.env.MEETING_PARALLEL || 4);
        const pool = process.env.MEETING_LONG ? longMeetingCases(Number(process.env.MEETING_LONG)) : MEETING_CASES;
        const cases = pool.filter((c) => !only || only.includes(c.id));
        fs.mkdirSync(outDir, { recursive: true });

        for (const spec of specs) {
            const target = parseLlmTarget(spec);
            const rows: any[] = [];
            let next = 0;
            const worker = async () => {
                while (next < cases.length) {
                    const testCase = cases[next++];
                    try {
                        const run = await analyzeMeeting({
                            transcript: testCase.transcript, userName: MEETING_USER, participants: testCase.participants,
                            now: new Date(MEETING_NOW), timeZone: MEETING_TIME_ZONE, title: testCase.title,
                        }, [target]);
                        rows.push({ id: testCase.id, run, score: scoreCase(testCase, run.analysis) });
                    } catch (error: any) {
                        rows.push({ id: testCase.id, error: String(error?.code || error?.message || error).slice(0, 200) });
                    }
                }
            };
            await Promise.all(Array.from({ length: parallel }, worker));
            rows.sort((a, b) => a.id.localeCompare(b.id));

            const ok = rows.filter((r) => r.score);
            const failedCases = rows.filter((r) => r.error);
            const empty = { summary: '', decisions: [], commitments: [], openQuestions: [] };
            // A failed answer counts as an empty one, so errors are never hidden.
            const scores = rows.map((r) => r.score ?? scoreCase(cases.find((c) => c.id === r.id)!, empty));
            const inputTokens = ok.reduce((a, r) => a + r.run.inputTokens, 0);
            const outputTokens = ok.reduce((a, r) => a + r.run.outputTokens, 0);
            const reported = ok.map((r) => r.run.costUsd).filter((c: any) => typeof c === 'number');
            const summary = {
                model: spec,
                ranAt: new Date().toISOString(),
                errors: failedCases.length,
                ...totals(scores, cases),
                latencyMedianMs: median(ok.map((r) => r.run.latencyMs)),
                latencyP90Ms: p90(ok.map((r) => r.run.latencyMs)),
                inputTokensPerMeeting: Math.round(inputTokens / Math.max(1, ok.length)),
                outputTokensPerMeeting: Math.round(outputTokens / Math.max(1, ok.length)),
                costPerMeetingListUsd: llmCost(spec.split('@')[0], inputTokens, outputTokens) === null ? null : llmCost(spec.split('@')[0], inputTokens, outputTokens)! / Math.max(1, ok.length),
                costPerMeetingReportedUsd: reported.length ? reported.reduce((a: number, b: number) => a + b, 0) / reported.length : null,
            };
            const file = path.join(outDir, `analisis${process.env.MEETING_LONG ? `-larga${process.env.MEETING_LONG}` : ''}-${spec.replace(/[^a-z0-9.-]+/gi, '_')}.json`);
            fs.writeFileSync(file, JSON.stringify({ summary, rows }, null, 2));
            console.log(JSON.stringify(summary));
        }
    }, 3_600_000);
});
