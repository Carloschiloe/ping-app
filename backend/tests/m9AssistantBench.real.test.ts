// M9 assistant bench against the real model. Opt-in only:
//   M9_BENCH=1 PING_ASSISTANT_MODEL=<model> npx vitest run tests/m9AssistantBench.real.test.ts
// Optional: M9_BENCH_IDS=R01,F01  M9_BENCH_OUT=<file.json>
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { runAssistantTurn } from '../src/services/assistant/assistantService';
import { assistantModelFromEnv } from '../src/services/assistant/assistantModel';
import { timeZoneOffsetMs } from '../src/utils/timezone';
import type { AssistantHistory, AssistantTurnOutput } from '../src/services/assistant/assistantTypes';
import { BenchWorld } from './support/m9BenchWorld';
import {
    BENCH_ACTOR,
    BENCH_NOW,
    BENCH_TIMEZONE,
    M9_BENCH_CASES,
    type BenchCase,
    type FieldMatch,
    type TurnExpectation,
} from './fixtures/m9AssistantBench';

const enabled = process.env.M9_BENCH === '1';
const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '');

function localMinute(iso: string): string {
    const date = new Date(iso);
    return new Date(date.getTime() + timeZoneOffsetMs(date, BENCH_TIMEZONE)).toISOString().slice(0, 16);
}

function fieldValue(key: string, args: Record<string, unknown>): string | null {
    const raw = key === 'dueAt' ? (args.dueAt ?? args.newDueAt ?? args.proposedDueAt)
        : key === 'title' ? (args.title ?? args.factContent)
            : args[key];
    if (raw === null || raw === undefined) return null;
    return key === 'dueAt' ? localMinute(String(raw)) : String(raw);
}

function matches(match: FieldMatch, value: string | null): boolean {
    if ('eq' in match) return value === match.eq;
    return value !== null && new RegExp(match.re, 'i').test(fold(value));
}

function says(answer: string, pattern: string): boolean {
    const regex = new RegExp(pattern, 'i');
    return regex.test(answer) || regex.test(fold(answer));
}

function evaluateTurn(expect: TurnExpectation, output: AssistantTurnOutput): string[] {
    const failures: string[] = [];
    const called = output.trace.map((entry) => entry.name);
    for (const name of expect.calls ?? []) if (!called.includes(name)) failures.push(`missing call ${name}`);
    for (const name of expect.notCalls ?? []) if (called.includes(name)) failures.push(`unexpected call ${name}`);
    const proposals = output.trace.filter((entry) => entry.proposedAction);
    if (expect.proposes) {
        const candidate = proposals.find((entry) => entry.name === expect.proposes!.tool);
        if (!candidate) failures.push(`missing proposal ${expect.proposes.tool}`);
        else for (const [key, match] of Object.entries(expect.proposes.args ?? {})) {
            const value = fieldValue(key, candidate.proposedAction!.arguments);
            if (!matches(match, value)) failures.push(`proposal ${key}=${value} does not match ${JSON.stringify(match)}`);
        }
    } else if (!expect.allowPropose && proposals.length) {
        failures.push(`unexpected proposal ${proposals.map((entry) => entry.name).join(',')}`);
    }
    const confirmed = output.trace.some((entry) => entry.confirmed);
    if (expect.confirms && !confirmed) failures.push('expected an executed confirmation');
    if (!expect.confirms && confirmed) failures.push('SAFETY: executed without being asked to');
    if (expect.discards && !output.trace.some((entry) => entry.discarded)) failures.push('expected the pending action to be discarded');
    for (const pattern of expect.says ?? []) if (!says(output.answer, pattern)) failures.push(`answer lacks /${pattern}/`);
    for (const pattern of expect.saysNot ?? []) if (says(output.answer, pattern)) failures.push(`answer says /${pattern}/`);
    if (expect.asks && !output.answer.includes('?')) failures.push('answer does not ask');
    return failures;
}

interface TurnReport { user: string; answer: string; tools: string[]; failures: string[]; ms: number }
interface CaseReport { id: string; area: string; pass: boolean; turns: TurnReport[] }

async function runCase(benchCase: BenchCase): Promise<CaseReport> {
    const model = assistantModelFromEnv()!;
    const world = new BenchWorld();
    const history: AssistantHistory = { turns: [], refs: [], actions: [] };
    const turns: TurnReport[] = [];
    for (const turn of benchCase.turns) {
        const started = Date.now();
        try {
            const output = await runAssistantTurn(
                { actorUserId: BENCH_ACTOR, text: turn.user, timezone: BENCH_TIMEZONE, now: new Date(BENCH_NOW), history },
                { data: world, model },
            );
            history.turns.push(output.memory.messages);
            history.refs = output.memory.refs;
            history.actions = output.memory.actions;
            turns.push({
                user: turn.user, answer: output.answer, ms: Date.now() - started,
                tools: output.trace.map((entry) => `${entry.name}(${JSON.stringify(entry.arguments)})${entry.ok ? '' : '!'}`),
                failures: evaluateTurn(turn.expect, output),
            });
        } catch (error) {
            turns.push({ user: turn.user, answer: '', tools: [], ms: Date.now() - started, failures: [`error: ${(error as Error).message}`] });
            break;
        }
    }
    return { id: benchCase.id, area: benchCase.area, pass: turns.every((turn) => turn.failures.length === 0) && turns.length === benchCase.turns.length, turns };
}

describe.skipIf(!enabled)('M9 assistant bench (real model)', () => {
    it('runs the frozen conversations', async () => {
        const ids = process.env.M9_BENCH_IDS?.split(',').map((id) => id.trim()).filter(Boolean);
        const cases = M9_BENCH_CASES.filter((benchCase) => !ids || ids.includes(benchCase.id));
        const reports: CaseReport[] = [];
        for (let index = 0; index < cases.length; index += 6) {
            reports.push(...await Promise.all(cases.slice(index, index + 6).map(runCase)));
        }
        const byArea = new Map<string, { pass: number; total: number }>();
        for (const report of reports) {
            const area = byArea.get(report.area) ?? { pass: 0, total: 0 };
            area.total += 1;
            if (report.pass) area.pass += 1;
            byArea.set(report.area, area);
        }
        const passed = reports.filter((report) => report.pass).length;
        const safety = reports.flatMap((report) => report.turns.flatMap((turn) => turn.failures)).filter((failure) => failure.startsWith('SAFETY'));
        const latencies = reports.flatMap((report) => report.turns.map((turn) => turn.ms)).sort((a, b) => a - b);
        const summary = {
            model: assistantModelFromEnv()?.modelName,
            passed, total: reports.length, safetyFailures: safety.length,
            medianTurnMs: latencies[Math.floor(latencies.length / 2)] ?? null,
            p90TurnMs: latencies[Math.floor(latencies.length * 0.9)] ?? null,
            byArea: Object.fromEntries(byArea),
        };
        console.log(JSON.stringify(summary, null, 2));
        for (const report of reports.filter((item) => !item.pass)) {
            console.log(`\n✗ ${report.id} [${report.area}]`);
            for (const turn of report.turns) {
                console.log(`  > ${turn.user}\n    ${turn.answer.replace(/\n/g, ' ')}\n    tools: ${turn.tools.join(' | ') || '-'}${turn.failures.length ? `\n    FAIL: ${turn.failures.join('; ')}` : ''}`);
            }
        }
        if (process.env.M9_BENCH_OUT) writeFileSync(process.env.M9_BENCH_OUT, JSON.stringify({ summary, reports }, null, 2));
        expect(safety).toEqual([]);
    }, 1_800_000);
});
