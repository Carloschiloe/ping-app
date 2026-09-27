import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import {
    OpenAiSemanticModel,
    parseSemanticV4ModelOutput,
    type SemanticDialogueContext,
} from '../src/services/canonicalSemanticProducer.service';

type ExpectedRelation = NonNullable<import('../src/types/agentTurnCommit').NormalizedSemanticTurnV4['openObjectiveRelation']>;

export interface HoldoutCase {
    id: string;
    utterance: string;
    dialogue: SemanticDialogueContext;
    expected: ExpectedRelation[];
}

export interface HoldoutEvaluation {
    observed: {
        kind: string;
        relation: string | null;
        pendingSlotAnswer: string;
        continuationLike: string;
        independentObjective: string;
        objectiveType: string | null;
        candidateSlotType: string | null;
        confidence: number;
    } | null;
    pass: boolean;
    schemaInvalid: boolean;
    failure: string | null;
}

export const HOLDOUT_CASES_PATH = path.resolve(
    process.env.M7_SEMANTIC_RELATION_HOLDOUT_CASES
        ?? path.join(process.cwd(), 'certification', 'm7-semantic-objective-relation-holdout.v1.json'),
);
export const HOLDOUT_CASES_SHA256 = '1258eb01aa9f2c945570a864e79912f845c08ff39e1c71f34fab9cae9ef363ac';
const artifactRoot = path.resolve(
    process.env.M7_SEMANTIC_RELATION_HOLDOUT_ARTIFACT_ROOT
        ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'semantic-objective-relation-holdout-20260927-v1'),
);

function sha256(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function loadHoldoutCases(): HoldoutCase[] {
    const raw = fs.readFileSync(HOLDOUT_CASES_PATH, 'utf8');
    if (sha256(raw) !== HOLDOUT_CASES_SHA256) throw new Error('HOLDOUT_CASES_HASH_MISMATCH');
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length !== 12) throw new Error('HOLDOUT_CASE_COUNT_MISMATCH');
    return parsed as HoldoutCase[];
}

function observedSummary(semantic: ReturnType<typeof parseSemanticV4ModelOutput>['semantic']): HoldoutEvaluation['observed'] {
    return {
        kind: semantic.kind,
        relation: semantic.openObjectiveRelation ?? null,
        pendingSlotAnswer: semantic.pendingSlotAnswer,
        continuationLike: semantic.continuationLike,
        independentObjective: semantic.independentObjective,
        objectiveType: semantic.objectiveType,
        candidateSlotType: semantic.candidateSlotType,
        confidence: semantic.confidence,
    };
}

export function evaluateHoldoutCase(testCase: HoldoutCase, raw: string): HoldoutEvaluation {
    try {
        const parsed = parseSemanticV4ModelOutput(raw);
        const observed = observedSummary(parsed.semantic);
        const pass = parsed.diagnostics.schemaValid
            && parsed.diagnostics.failure === null
            && testCase.expected.includes(observed.relation as ExpectedRelation);
        return {
            observed,
            pass,
            schemaInvalid: !parsed.diagnostics.schemaValid,
            failure: parsed.diagnostics.failure,
        };
    } catch {
        return { observed: null, pass: false, schemaInvalid: true, failure: 'normalization_error' };
    }
}

async function main(): Promise<void> {
    if (!process.env.OPENAI_API_KEY?.trim()) {
        console.log(JSON.stringify({ status: 'blocked', reason: 'OPENAI_API_KEY_NOT_CONFIGURED' }));
        return;
    }
    process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
    const cases = loadHoldoutCases();
    fs.mkdirSync(artifactRoot, { recursive: true });
    const model = new OpenAiSemanticModel('gpt-5.6-sol');
    const results: Array<Record<string, unknown>> = [];
    let accepted = 0;
    let schemaInvalid = 0;
    let providerErrors = 0;

    for (const testCase of cases) {
        const response = await model.interpretWithDiagnostics({
            text: testCase.utterance,
            modality: 'text',
            locale: 'es-CL',
            timezone: 'America/Santiago',
            dialogue: testCase.dialogue,
            semanticVersion: 4,
        });
        if (response.kind === 'error') {
            providerErrors += 1;
            results.push({ id: testCase.id, expected: testCase.expected, providerError: response });
            continue;
        }
        const raw = response.content ?? '';
        const rawPath = path.join(artifactRoot, `${testCase.id}.raw.json`);
        fs.writeFileSync(rawPath, raw, { encoding: 'utf8', flag: 'wx' });
        const evaluated = evaluateHoldoutCase(testCase, raw);
        if (evaluated.schemaInvalid) schemaInvalid += 1;
        if (evaluated.pass) accepted += 1;
        results.push({
            id: testCase.id,
            utterance: testCase.utterance,
            expected: testCase.expected,
            observed: evaluated.observed,
            schemaValid: !evaluated.schemaInvalid,
            failure: evaluated.failure,
            pass: evaluated.pass,
            rawSha256: sha256(raw),
            finishReason: response.finishReason,
            latencyMs: response.latencyMs,
        });
    }

    const report = {
        version: 1,
        model: model.modelName,
        cases: cases.length,
        batterySha256: HOLDOUT_CASES_SHA256,
        calls: cases.length,
        accepted,
        fail: cases.length - accepted,
        schemaInvalid,
        providerErrors,
        results,
        sideEffects: { writers: 0, persistence: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: 0 },
    };
    fs.writeFileSync(path.join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify({ status: 'complete', ...report, artifactRoot }));
}

if (require.main === module) {
    void main().catch(error => {
        console.error(JSON.stringify({ status: 'runner_error', name: error instanceof Error ? error.name : 'unknown', message: error instanceof Error ? error.message : 'unknown' }));
        process.exitCode = 1;
    });
}
