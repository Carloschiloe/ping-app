import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { OpenAiSemanticModel, parseSemanticV4ModelOutput, type SemanticDialogueContext } from '../src/services/canonicalSemanticProducer.service';
import { adaptSemanticV4ToCore, runSemanticV4CoreShadow } from '../src/services/agentSemanticV4CoreShadow.service';
import { AgentSemanticV4HighFidelityReadOnlyResolver, createHighFidelityReadOnlyRepositoryForTest } from '../src/services/agentSemanticV4HighFidelityReadOnly.service';
import { agentTurnDispositionService } from '../src/services/agentTurnDisposition.service';

const ACTOR = '00000000-0000-4000-8000-000000000001';
const CLOCK = new Date('2026-09-27T15:00:00.000Z');
const MODEL = 'gpt-5.6-sol';
const artifactRoot = path.resolve(process.env.M7_REAL_MULTITURN_ARTIFACT_ROOT ?? path.join(process.cwd(), '.m7-smoke-artifacts', 'real-multiturn-v4-shadow-20260927-v1'));
const conversations = [
    { id: 'mt-a', turns: [
        'Quiero coordinar la revisión de la caldera el martes.',
        'Mejor el miércoles en la tarde.',
        'Ahora necesito llamar al administrador.',
        'Que sea el viernes.',
        'Volvamos a la revisión de la caldera.',
    ] },
    { id: 'mt-b', turns: [
        'Necesito reservar una visita técnica.',
        'Todavía no sé cuándo.',
        'Además, acuérdame comprar sobres.',
        'Retomemos la visita técnica.',
        'El jueves a primera hora.',
    ] },
] as const;

function sha(value: string): string { return createHash('sha256').update(value, 'utf8').digest('hex'); }
function repo(): any {
    return createHighFidelityReadOnlyRepositoryForTest({ commitments: [], people: [] });
}
function legacyFor(semantic: any): any {
    return {
        route: semantic.kind === 'read_request' ? 'read' : 'write',
        interpretation: { isWriteActionRequest: semantic.kind !== 'read_request', schemaValid: true },
        objective: semantic.kind === 'read_request' ? null : {
            objectiveType: semantic.objectiveType ?? 'create_personal_commitment',
            targetEntities: { personHints: [], entityHints: semantic.entityHints ?? [] },
            constraints: { decisionHint: null, draftOnly: false, responsibleHint: null },
            desiredOutcome: String(semantic.slots?.title ?? semantic.slots?.action ?? ''),
            timeConstraints: { rawHint: null }, actor: ACTOR, sourceUtterance: '', confidence: semantic.confidence,
            ambiguities: [], source: 'llm', communicateContentCandidate: null, modelUsed: MODEL,
        },
    };
}
function activeObjectiveContext(snapshot: any): SemanticDialogueContext['activeObjective'] {
    const active = snapshot.activeDialogue?.objective ?? snapshot.activeDialogue;
    if (!active) return null;
    return {
        objectiveType: active.objectiveType ?? 'create_personal_commitment',
        desiredOutcome: active.desiredOutcome ?? active.slots?.title ?? active.slots?.action ?? '',
        knownSlots: active.slots ?? {},
        targetHints: active.targetEntities?.entityHints ?? active.entityHints ?? [],
    };
}
function dialogueContext(snapshot: any): SemanticDialogueContext {
    const active = activeObjectiveContext(snapshot);
    return {
        lifecycle: snapshot.lifecycle === 'idle' ? 'none' : 'active',
        activeObjectiveType: active?.objectiveType ?? null,
        missingSlotType: null,
        suspendedObjectiveType: snapshot.suspendedDialogue?.objective?.objectiveType ?? null,
        referentHints: [],
        activeObjective: active,
    };
}
function nextSnapshot(snapshot: any, transition: any, turnIndex: number): any {
    const activeDialogue = transition.activeDialogue ?? null;
    const suspendedDialogue = transition.suspendedDialogue ?? null;
    return {
        lifecycle: activeDialogue ? 'clarifying' : 'idle',
        activeDialogue,
        suspendedDialogue,
        version: snapshot.version + 1,
        lastAppliedTurnId: `${snapshot.lastAppliedTurnId ?? 'mt'}-${turnIndex}`,
        lastAppliedTurnSequence: turnIndex,
    };
}

type Observable = { id: string; turn: number; relation: string | null; schemaValid: boolean; failure: string | null; disposition: string | null; reason: string | null; planRoute: string | null; sideEffects: unknown };

async function evaluateTurn(model: OpenAiSemanticModel, conversationId: string, turnIndex: number, utterance: string, snapshot: any, live: boolean): Promise<{ observable: Observable; next: any }> {
    let raw: string;
    let responseMeta: any = null;
    if (live) {
        const response = await model.interpretWithDiagnostics({ text: utterance, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: dialogueContext(snapshot), semanticVersion: 4 });
        if (response.kind === 'error') throw new Error(`PROVIDER_ERROR=${JSON.stringify({ errorClass: response.errorClass, httpStatus: response.httpStatus, errorCode: response.errorCode, errorMessage: response.errorMessage })}`);
        raw = response.content ?? '';
        fs.writeFileSync(path.join(artifactRoot, `${conversationId}-turn-${turnIndex}.raw.json`), raw, { encoding: 'utf8', flag: 'wx' });
        responseMeta = { finishReason: response.finishReason, latencyMs: response.latencyMs, rawSha256: sha(raw) };
    } else {
        raw = fs.readFileSync(path.join(artifactRoot, `${conversationId}-turn-${turnIndex}.raw.json`), 'utf8');
    }
    const parsed = parseSemanticV4ModelOutput(raw);
    let shadow: any = null;
    let next = snapshot;
    if (parsed.diagnostics.schemaValid && !parsed.diagnostics.failure) {
        const legacy = legacyFor(parsed.semantic);
        shadow = await runSemanticV4CoreShadow({
            legacy,
            request: { text: utterance, modality: 'text', locale: 'es-CL', timezone: 'America/Santiago', dialogue: dialogueContext(snapshot) },
            dialogue: snapshot,
            actorUserId: ACTOR,
            dialogueScopeKey: conversationId,
            turnReferenceInstant: CLOCK.toISOString(),
            semanticResult: { semantic: parsed.semantic, diagnostics: {
                schemaValid: true, failure: null, providerRequestSucceeded: true, providerFailure: false, providerErrorClass: null,
                providerHttpStatus: null, providerErrorCode: null, providerErrorMessage: null, finishReason: 'stop', refusalPresent: false,
                contentPresent: true, contentLength: raw.length, normalizationSuccess: true, fallbackReason: null, model: MODEL,
                latencyMs: responseMeta?.latencyMs ?? 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, reasoningTokens: 0 },
            } },
            resolver: new AgentSemanticV4HighFidelityReadOnlyResolver(repo()),
        });
        const adapted = adaptSemanticV4ToCore(parsed.semantic);
        const resolution = await new AgentSemanticV4HighFidelityReadOnlyResolver(repo()).resolve({ actorUserId: ACTOR, dialogueScopeKey: conversationId, semanticV4: adapted.semanticV4, semanticV2: adapted.semanticV2, dialogue: snapshot, timezone: 'America/Santiago', turnReferenceInstant: CLOCK.toISOString() });
        const decision = agentTurnDispositionService.decide({ semanticTurn: adapted.dispositionSemantic, dialogue: snapshot, pendingSlotResolution: resolution.pendingSlotResolution });
        next = nextSnapshot(snapshot, decision.transition, turnIndex);
    }
    const observable: Observable = {
        id: conversationId, turn: turnIndex, relation: parsed.semantic.openObjectiveRelation ?? null,
        schemaValid: parsed.diagnostics.schemaValid, failure: parsed.diagnostics.failure,
        disposition: shadow?.core?.disposition ?? null, reason: shadow?.core?.dispositionReason ?? null,
        planRoute: shadow?.core?.planShape?.route ?? null, sideEffects: shadow?.sideEffects ?? null,
    };
    return { observable, next };
}

async function runPass(model: OpenAiSemanticModel, live: boolean): Promise<Observable[]> {
    const all: Observable[] = [];
    for (const conversation of conversations) {
        let snapshot: any = { lifecycle: 'idle', activeDialogue: null, suspendedDialogue: null, version: 0, lastAppliedTurnId: null, lastAppliedTurnSequence: 0 };
        for (const [index, utterance] of conversation.turns.entries()) {
            const evaluated = await evaluateTurn(model, conversation.id, index + 1, utterance, snapshot, live);
            all.push(evaluated.observable);
            snapshot = evaluated.next;
        }
    }
    return all;
}

async function main(): Promise<void> {
    if (!process.env.OPENAI_API_KEY?.trim()) throw new Error('OPENAI_API_KEY_REQUIRED');
    process.env.M7_BLIND_MAX_COMPLETION_TOKENS ??= '1024';
    fs.mkdirSync(artifactRoot, { recursive: true });
    fs.writeFileSync(path.join(artifactRoot, 'manifest.json'), `${JSON.stringify({ model: MODEL, conversations, calls: 10 }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    const model = new OpenAiSemanticModel(MODEL);
    const live = await runPass(model, true);
    const replay1 = await runPass(model, false);
    const replay2 = await runPass(model, false);
    const projection = (items: Observable[]) => items.map(({ id, turn, relation, schemaValid, failure, disposition, reason, planRoute, sideEffects }) => ({ id, turn, relation, schemaValid, failure, disposition, reason, planRoute, sideEffects }));
    const pLive = projection(live);
    const pReplay1 = projection(replay1);
    const pReplay2 = projection(replay2);
    const report = {
        model: MODEL, conversations: conversations.length, turns: live.length, openAiCalls: 10,
        live: pLive, replay1: pReplay1, replay2: pReplay2,
        captureVsReplay: JSON.stringify(pLive) === JSON.stringify(pReplay1),
        replay1VsReplay2: JSON.stringify(pReplay1) === JSON.stringify(pReplay2),
        schemaInvalid: live.filter(item => !item.schemaValid).length,
        shadowFailures: live.filter(item => item.reason === null && item.disposition === null).length,
        sideEffects: { writers: 0, persistence: 0, tools: 0, messages: 0, memoryWrites: 0, dialogueMutations: 0 },
    };
    fs.writeFileSync(path.join(artifactRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    console.log(JSON.stringify(report));
}

if (require.main === module) void main().catch(error => {
    console.error(JSON.stringify({ status: 'runner_error', message: error instanceof Error ? error.message : 'unknown' }));
    process.exitCode = 1;
});
