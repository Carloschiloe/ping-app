// M-3 — Agent Planner. Turns a Core-classified `AgentObjective` into a DRAFT
// `AgentPlan`: resolves identity/entity/time using EXISTING canonical
// retrieval (never re-implemented, sección 13/14/21), decides blocking vs
// non-blocking ambiguity (sección 15), and builds steps against the
// ToolRegistry (sección 10) — never inventing a tool, never trusting an
// LLM-provided ID. This module NEVER calls a write RPC, NEVER sends a
// message, NEVER creates/mutates a commitment or proposal — it only reads
// (resolvePerson, retrieveCommitments, retrieveCommitmentProposals,
// parseDateFromText) to ground a plan that a future M-4 would execute.
import { randomUUID } from 'crypto';
import { resolvePerson, retrieveCommitments, retrieveCommitmentProposals, retrieveVisibleCommitmentById, resolveDirectConversation } from './retrieval.service';
import { parseDateFromText, resolveTimeZone } from './date-parser.service';
import { retrieveMemory } from './memory.service';
import { COMMITMENT_TRANSITION_TABLE } from '../utils/commitmentTransitions';
import { getToolContract } from './toolRegistry.service';
import type { RetrievalCommitment, RetrievalPerson, DirectConversationResolution } from '../types/retrieval';
import type {
    AgentObjective,
    AgentPlan,
    AgentPlanStep,
    AgentPlanFailureMode,
    AgentObjectiveAmbiguity,
    ClarificationQuestion,
    ConfirmationPolicy,
    SideEffectClass,
    MessageContentCandidate,
} from '../types/agentPlan';
import { tracePlan } from '../utils/planTrace';
import type { ContextReferent } from '../types/agentInput';

export interface AgentPlannerInput {
    objective: AgentObjective;
    actorUserId: string;
    conversationId?: string;
    now: Date;
    timezone?: string;
    traceId?: string;
    contextReferents?: ContextReferent[];
}

interface DraftOutcome {
    steps: AgentPlanStep[];
    blockingAmbiguities: AgentObjectiveAmbiguity[];
    failureMode?: AgentPlanFailureMode;
    failureMessage?: string;
}

const ENTITY_CANDIDATE_LIMIT = 5;

function newStepId(): string {
    return `step-${randomUUID().slice(0, 8)}`;
}

// M-4 (sección 9/10/19/62 adversarial): /agent/authorize re-ejecuta este
// mismo pipeline desde cero para verificar el digest (Option C, nunca
// confía en un plan JSON del cliente) -- eso significa que CADA llamada a
// planObjective produce sus propios stepId random y nuevos, incluso para el
// MISMO request lógico. Si el cliente autoriza usando los stepId que vio en
// su propia llamada a /agent/plan, esos IDs jamás coincidirían con los de
// la re-planificación interna de /agent/authorize -- un rechazo
// "plan_changed" FALSO POSITIVO en el 100% de los casos reales, nunca
// detectado por los tests unitarios de M-3 porque cada uno de ellos sólo
// planifica UNA vez. Se resuelve reasignando cada stepId de forma
// determinística por POSICIÓN dentro del array ya ordenado (mismo principio
// posicional que agentPlanDigest.service.ts ya usa para el propio digest) --
// dos planificaciones independientes del mismo estado canónico producen
// exactamente los mismos stepId literales, nunca sólo un digest que coincide
// "por casualidad" mientras los IDs reales no.
function canonicalizeStepIds(steps: AgentPlanStep[]): AgentPlanStep[] {
    const idMap = new Map(steps.map((step, index) => [step.stepId, `step-${index}`]));
    return steps.map((step) => ({
        ...step,
        stepId: idMap.get(step.stepId)!,
        dependsOn: step.dependsOn.map((id) => idMap.get(id) ?? id),
        condition: step.condition.dependsOnStepId
            ? { ...step.condition, dependsOnStepId: idMap.get(step.condition.dependsOnStepId) ?? step.condition.dependsOnStepId }
            : step.condition,
    }));
}

// ─── Identity resolution (sección 12) — never invents a recipient. ─────────
async function resolvePersonHint(actorUserId: string, hint: string, conversationId?: string): Promise<{
    resolved: RetrievalPerson | null;
    ambiguous: boolean;
    candidates: RetrievalPerson[];
}> {
    return resolvePerson(actorUserId, { name: hint, conversationId });
}

// ─── Entity resolution (sección 13) — reuses the SAME retrieval functions
// the read-only Agent already uses; never a "best guess" write plan. ───────
async function resolveEntityHint(actorUserId: string, hint: string): Promise<RetrievalCommitment[]> {
    const [commitments, proposals] = await Promise.all([
        retrieveCommitments({ actorUserId, query: hint }, ENTITY_CANDIDATE_LIMIT),
        retrieveCommitmentProposals({ actorUserId, query: hint }, ENTITY_CANDIDATE_LIMIT),
    ]);
    const needle = hint.trim().toLowerCase();
    // Nunca confía ciegamente en el ranking de relevancia textual del FTS —
    // exige que el título REAL devuelto contenga el hint, honestamente
    // (sección 13: "no best guess").
    return [...commitments, ...proposals].filter((c) => c.title.toLowerCase().includes(needle));
}

function riskLevelFor(sideEffectClass: SideEffectClass, isShared: boolean): 'low' | 'medium' | 'high' {
    if (sideEffectClass === 'none' || sideEffectClass === 'reversible') return 'low';
    if (sideEffectClass === 'external_irreversible' || sideEffectClass === 'high_risk') return 'high';
    // state_change — Core-only escalation (sección 36: "LLM cannot downgrade
    // risk"): un commitment/proposal con más de un participante real eleva
    // el riesgo de medium a high, nunca al revés.
    return isShared ? 'high' : 'medium';
}

function buildStep(params: {
    toolId: string;
    operation: string;
    args: Record<string, unknown>;
    dependsOn?: string[];
    condition?: AgentPlanStep['condition'];
    expectedEffect: string;
    isShared?: boolean;
    sourceUtteranceSpan?: string;
    resolvedFrom: AgentPlanStep['provenance']['resolvedFrom'];
    canonicalSourceRefs?: { sourceType: string; sourceId: string }[];
    status?: AgentPlanStep['status'];
}): AgentPlanStep {
    const contract = getToolContract(params.toolId);
    if (!contract) {
        throw new Error(`agentPlanner attempted to reference unknown toolId "${params.toolId}" — this is a bug, never surfaced to a user; the validator would reject it anyway.`);
    }
    return {
        stepId: newStepId(),
        toolId: contract.toolId,
        toolVersion: contract.version,
        operation: params.operation,
        arguments: params.args,
        dependsOn: params.dependsOn ?? [],
        condition: params.condition ?? { type: 'always', description: 'No preconditions — can be attempted immediately.' },
        expectedEffect: params.expectedEffect,
        authorizationRequirement: contract.authorizationRequirement,
        confirmationRequirement: contract.confirmationPolicy,
        sideEffectClass: contract.sideEffectClass,
        riskLevel: riskLevelFor(contract.sideEffectClass, params.isShared ?? false),
        preconditions: [],
        postconditions: [],
        rollbackCapability: contract.sideEffectClass === 'none' ? 'not_applicable_read_only' : 'reversible_by_owner',
        provenance: {
            sourceUtteranceSpan: params.sourceUtteranceSpan,
            resolvedFrom: params.resolvedFrom,
            canonicalSourceRefs: params.canonicalSourceRefs ?? [],
        },
        status: params.status ?? 'pending',
    };
}

function isEntityShared(entity: RetrievalCommitment): boolean {
    // Un commitment/proposal es "compartido" cuando tiene un conversationId
    // real (implica otros participantes) — nunca asumido de status/tipo.
    return !!entity.conversationId;
}

// ─── Core-owned send_message content VALIDATION (sección 1/36: "the model
// may suggest WHERE the payload is; it may not supply replacement payload
// text"). This is the ONLY place a `MessageContentCandidate` ever turns
// into executable `send_message.arguments.content`, and it contains ZERO
// word/connector lists, ZERO language-specific logic. A proposer (today:
// this repo's own deterministic colon/quote fast paths and the LLM
// interpreter's `verbatimMessageHint`) may only claim a literal substring
// exists in `sourceUtterance` — never a position, never replacement text.
// Core proves that claim itself. Invariants, all of them pure
// substring-location logic:
//   - a candidate must exist (no candidate -> unsafe, never a text
//     fallback to desiredOutcome);
//   - `verbatimText` must be non-empty;
//   - the recipient's own hint must actually occur in sourceUtterance,
//     establishing the addressing span to exclude;
//   - `verbatimText` must occur, AT LEAST ONCE, strictly after the end of
//     that addressing span (the region search is confined to
//     `sourceUtterance` AFTER the recipient's name — the addressing span
//     itself can never be claimed as payload);
//   - that occurrence must be UNIQUE within that region — an ambiguous
//     (2+) match is rejected exactly like an absent one, never guessed;
//   - a candidate that doesn't literally occur there (absent, translated,
//     paraphrased, truncated — none of those are ever a real substring
//     match) is rejected by the same "not found" path, no separate
//     translation-detection logic needed;
//   - Core computes start/end ITSELF from the located match — always as
//     UTF-16 code-unit indices/boundaries into the JS string object
//     (never encoded bytes; JS strings have no byte representation until
//     something explicitly encodes them, which never happens here) — and
//     freezes content via `sourceUtterance.slice(start, end)` — never the
//     proposer's own string instance.
//
// Real-staging root cause (M-6 physical retest, 2026-09-10): gpt-4o-mini,
// even explicitly instructed to copy the message "VERBATIM ... same
// wording, and punctuation", reliably capitalizes the first letter when it
// presents what it perceives as a standalone quoted message — e.g. for
// "Dile a Alejandra que llegaré tarde" the model proposed "Llegaré tarde"
// (capital L) while the literal source substring, mid-sentence, is
// lowercase "llegaré tarde". An exact-case `indexOf` never finds that, so
// every real natural-phrasing candidate silently failed to locate.
//
// FOLLOW-UP FIX (Unicode-safe localization, this revision): the first
// version of the case-insensitive fallback computed
// `haystack.toLowerCase().indexOf(needle.toLowerCase())` and then reused
// that index directly against the ORIGINAL (non-lowercased) string. That
// is unsafe: Unicode case conversion is not guaranteed to preserve UTF-16
// length — e.g. "İ" (U+0130 LATIN CAPITAL LETTER I WITH DOT ABOVE)
// lowercases to "i" + COMBINING DOT ABOVE (2 code units instead of 1). An
// index found in a lowercased copy can therefore point at the wrong
// position — or split a surrogate pair / combining sequence — once
// reapplied to the original string. The rule going forward: every index or
// boundary ever passed to `sourceUtterance.slice()` MUST be derived
// directly from `sourceUtterance` itself (or a region sliced from it),
// never measured against a lowercased/normalized copy.
//
// localizeCandidate() below enforces this in two ordered passes:
//   1) EXACT match first (`String.prototype.indexOf`) — the fast, always-
//      correct path; every boundary comes straight from the original
//      string, no transformation involved at all.
//   2) Only if no exact match exists: a Unicode-aware case-insensitive
//      fallback that walks the ORIGINAL string's own grapheme clusters
//      (`Intl.Segmenter`, which reports `index`/`segment` pairs computed
//      against the real string) and compares them to the candidate's
//      grapheme clusters ONE GRAPHEME AT A TIME using case-insensitive
//      string equality. Because each comparison is between two short,
//      already-extracted grapheme strings — never a measurement of a
//      lowercased copy's length or index — a length-changing case fold
//      (İ-class characters, ß, etc.) can only ever make that one grapheme
//      pair compare unequal (safe: the match attempt correctly fails);
//      it can never desynchronize the boundaries, which are taken
//      straight from `Intl.Segmenter`'s original-string segmentation the
//      whole time.
// Neither pass ever changes what gets sent: `content` is always re-sliced
// from the untouched, original-case `sourceUtterance` at the boundaries
// localizeCandidate found — never from the candidate's own casing. This
// does not weaken the verbatim contract's real guarantees (no paraphrase,
// no translation, no reordering, no invented words, no addressing overlap,
// no ambiguous match — all still reject exactly as before); it only stops
// rejecting an otherwise-correct match over letter case.
interface TextSpan { start: number; end: number }

function graphemeSpans(text: string): { text: string; start: number; end: number }[] {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
    const spans: { text: string; start: number; end: number }[] = [];
    for (const seg of segmenter.segment(text)) {
        // seg.index and seg.segment are both computed by the engine
        // directly against `text` — this is the ONLY place original-string
        // boundaries are ever established.
        spans.push({ text: seg.segment, start: seg.index, end: seg.index + seg.segment.length });
    }
    return spans;
}

function graphemeEqualsCaseInsensitive(a: string, b: string): boolean {
    if (a === b) return true;
    // Value-equality check only — the (possibly length-changing) result of
    // toLowerCase()/toUpperCase() is never used as an index or an offset,
    // only compared for equality against another short string. A grapheme
    // whose case fold changes length (İ, ß, ...) simply fails to compare
    // equal here rather than corrupting any boundary.
    return a.toLowerCase() === b.toLowerCase() || a.toUpperCase() === b.toUpperCase();
}

// Every returned span's start/end is taken directly from `haystack`'s own
// indices (via String.prototype.indexOf for the exact pass, via
// Intl.Segmenter's original-string segmentation for the fallback pass) —
// never derived from a transformed copy's length or position.
function findOccurrences(haystack: string, needle: string): TextSpan[] {
    if (needle.length === 0) return [];

    const exact: TextSpan[] = [];
    for (let from = 0; ;) {
        const idx = haystack.indexOf(needle, from);
        if (idx === -1) break;
        exact.push({ start: idx, end: idx + needle.length });
        from = idx + 1;
    }
    if (exact.length > 0) return exact; // exact match always takes precedence — see header comment

    const haystackGraphemes = graphemeSpans(haystack);
    const needleGraphemes = graphemeSpans(needle).map((g) => g.text);
    if (needleGraphemes.length === 0) return [];

    const fallback: TextSpan[] = [];
    for (let i = 0; i + needleGraphemes.length <= haystackGraphemes.length; i++) {
        let matched = true;
        for (let j = 0; j < needleGraphemes.length; j++) {
            if (!graphemeEqualsCaseInsensitive(haystackGraphemes[i + j].text, needleGraphemes[j])) {
                matched = false;
                break;
            }
        }
        if (matched) {
            fallback.push({ start: haystackGraphemes[i].start, end: haystackGraphemes[i + needleGraphemes.length - 1].end });
        }
    }
    return fallback;
}

export type CommunicateContentRejectionReason = 'no_candidate' | 'empty_text' | 'recipient_not_in_source' | 'not_found' | 'ambiguous' | 'empty_after_trim';

function validateCommunicateContent(
    sourceUtterance: string,
    personHint: string,
    candidate: MessageContentCandidate | null | undefined,
): { safe: boolean; content: string | null; reason: CommunicateContentRejectionReason | null } {
    if (!candidate) return { safe: false, content: null, reason: 'no_candidate' };
    const verbatimText = candidate.verbatimText;
    if (typeof verbatimText !== 'string' || verbatimText.length === 0) return { safe: false, content: null, reason: 'empty_text' };

    const addressingIdx = sourceUtterance.indexOf(personHint);
    if (addressingIdx === -1) return { safe: false, content: null, reason: 'recipient_not_in_source' };
    const addressingEnd = addressingIdx + personHint.length;

    // Confine the search to the region strictly after the recipient's own
    // name — this is what makes "overlaps recipient addressing" structurally
    // impossible rather than merely checked after the fact. `validRegion` is
    // a direct slice of `sourceUtterance`, so every span findOccurrences
    // returns is still expressed in ORIGINAL-string-compatible coordinates
    // once offset by `addressingEnd`.
    const validRegion = sourceUtterance.slice(addressingEnd);
    const matches = findOccurrences(validRegion, verbatimText);
    if (matches.length === 0) return { safe: false, content: null, reason: 'not_found' }; // absent, translated, or paraphrased
    if (matches.length > 1) return { safe: false, content: null, reason: 'ambiguous' }; // 2+ safe occurrences

    const start = addressingEnd + matches[0].start;
    const end = addressingEnd + matches[0].end; // UTF-16 code-unit indices, always original-source-derived — see header comment
    const content = sourceUtterance.slice(start, end).trim();
    return content ? { safe: true, content, reason: null } : { safe: false, content: null, reason: 'empty_after_trim' };
}

async function planCommunicate(objective: AgentObjective, input: AgentPlannerInput): Promise<DraftOutcome> {
    const hints = objective.targetEntities.personHints;
    if (hints.length === 0) {
        return {
            steps: [], blockingAmbiguities: [{
                field: 'recipient', kind: 'blocking', reason: 'No identifiqué a quién quieres avisarle.',
            }],
        };
    }

    const steps: AgentPlanStep[] = [];
    const blockingAmbiguities: AgentObjectiveAmbiguity[] = [];

    for (const hint of hints) {
        const result = await resolvePersonHint(input.actorUserId, hint, input.conversationId);
        if (!result.resolved || result.ambiguous) {
            blockingAmbiguities.push({
                field: 'recipient',
                kind: 'blocking',
                reason: result.ambiguous ? `Hay más de una persona que coincide con "${hint}".` : `No encontré a nadie llamado "${hint}" en tu red autorizada.`,
                candidates: result.candidates.map((c) => ({ id: c.id, label: c.displayName })),
            });
            continue;
        }

        // Core never trusts `objective.desiredOutcome` verbatim for a
        // send_message argument — when the LLM objective interpreter
        // produced the objective, that field is `desiredOutcomeHint`: a
        // free-form restatement the model is explicitly allowed to
        // paraphrase or translate (e.g. "Dile a Alejandra que llegaré
        // tarde" -> "Inform Alejandra that I will arrive late"), never a
        // literal transcript. The interpreter instead PROPOSED a verbatim
        // candidate substring (`objective.communicateContentCandidate`);
        // Core independently locates and validates it against the real
        // `sourceUtterance` (see validateCommunicateContent above) and only
        // ever emits content it re-sliced from the canonical utterance. No
        // candidate, or one that fails validation, is a blocking ambiguity
        // — clarification/non-ready — never a silent fallback to
        // desiredOutcome.
        const validated = validateCommunicateContent(objective.sourceUtterance, hint, objective.communicateContentCandidate);
        // Structured, non-sensitive observability (sección 40: ids/counts/
        // booleans/enum labels only — never the message text/candidate text
        // itself) so a real staging failure can be diagnosed from logs
        // instead of guessed at: candidate_validated + rejection_reason are
        // exactly what distinguishes "no candidate proposed at all" from
        // "a candidate was proposed but Core's independent location check
        // rejected it", which is what a purely binary needs_clarification
        // outcome could never tell us apart.
        tracePlan(input.traceId, 'COMMUNICATE_CONTENT_VALIDATED', {
            candidate_validated: validated.safe,
            rejection_reason: validated.reason,
            extraction_mode: objective.communicateContentCandidate?.extractionMode ?? null,
        });
        if (!validated.safe || !validated.content) {
            blockingAmbiguities.push({
                field: 'messageContent',
                kind: 'blocking',
                reason: `No pude determinar con certeza qué mensaje quieres enviarle a ${result.resolved.displayName}.`,
            });
            continue;
        }
        const messageContent = validated.content;

        // A contextual conversation remains authoritative. Global planning may
        // only continue after resolving exactly one existing authorized DIRECT
        // conversation; the planner never creates one or picks a first match.
        let conversationId = input.conversationId;
        let conversationResolution: DirectConversationResolution | null = null;

        if (!conversationId) {
            conversationResolution = await resolveDirectConversation(input.actorUserId, result.resolved.id);
            if (conversationResolution.ambiguous) {
                blockingAmbiguities.push({
                    field: 'conversation',
                    kind: 'blocking',
                    reason: `Hay ${conversationResolution.candidateCount} conversaciones directas con ${result.resolved.displayName}. Especifica en cuál enviar el mensaje.`,
                });
                continue;
            }
            if (!conversationResolution.conversationId) {
                blockingAmbiguities.push({
                    field: 'conversation',
                    kind: 'blocking',
                    reason: `No existe una conversación directa con ${result.resolved.displayName}. Inicia una conversación primero.`,
                });
                continue;
            }
            conversationId = conversationResolution.conversationId;
        }

        steps.push(buildStep({
            toolId: 'send_message',
            operation: `Enviar mensaje a ${result.resolved.displayName}`,
            args: { conversationId, recipientPersonId: result.resolved.id, content: messageContent },
            expectedEffect: `${result.resolved.displayName} recibirá el mensaje.`,
            sourceUtteranceSpan: hint,
            resolvedFrom: conversationResolution ? 'global_conversation_resolution' : 'entity_resolution',
            canonicalSourceRefs: [
                { sourceType: 'person', sourceId: result.resolved.id },
                ...(conversationResolution && conversationId
                    ? [{ sourceType: 'conversation', sourceId: conversationId }]
                    : []),
            ],
        }));
    }

    if (blockingAmbiguities.length > 0) return { steps: [], blockingAmbiguities };

    // sección 17/18: seguimiento condicional ("...y si acepta, agéndalo").
    const followUp = (objective as any).__followUp as string | undefined;
    if (followUp === 'create_commitment_or_proposal' && steps.length > 0) {
        const parsed = parseDateFromText(objective.sourceUtterance, input.now, resolveTimeZone(input.timezone));
        const waitStep = steps[0];
        steps.push(buildStep({
            toolId: 'create_commitment',
            operation: 'Crear el compromiso si la persona acepta',
            args: {
                title: objective.targetEntities.entityHints[0] ?? 'Compromiso acordado',
                dueAt: parsed ? parsed.date.toISOString() : null,
                responsiblePersonId: null,
                conversationId: steps[0].arguments.conversationId,
            },
            dependsOn: [waitStep.stepId],
            condition: { type: 'wait_for_response', dependsOnStepId: waitStep.stepId, description: 'Esperar la respuesta de la persona antes de agendar.' },
            expectedEffect: 'Se creará el compromiso, sólo si la persona acepta.',
            resolvedFrom: 'user_text',
        }));
    }

    return { steps, blockingAmbiguities: [] };
}

// ─── Memory-informed planning (sección 29/30) — memoria puede INFORMAR una
// fecha ("usa el horario que ella prefiere"), pero nunca de forma insegura:
// sólo un hecho VIGENTE (isCurrent), nunca 'restricted' (cero fuga de
// contexto privado hacia un argumento de tool, sección 30), con confianza
// razonable, y sólo si su propio texto es a su vez parseable por el MISMO
// parser determinístico de tiempo — nunca se "adivina" una hora a partir de
// una preferencia vaga ("por la tarde") sin una hora real extraíble. Cuando
// se usa, queda declarado en la provenance del step, nunca oculto (sección
// 26/28).
const MEMORY_TIME_CONFIDENCE_FLOOR = 0.6;

interface MemoryDateResolution {
    date: Date;
    memoryId: string;
    canonicalText: string;
}

async function tryResolveDateFromMemory(actorUserId: string, topicQuery: string, now: Date, timezone: string): Promise<MemoryDateResolution | null> {
    const results = await retrieveMemory({
        ownerUserId: actorUserId,
        subjectPersonId: null,
        subjectContactId: null,
        topicQuery,
        timeRange: null,
        memoryTypes: null,
        sourceTypes: null,
        freshness: 'current',
        limit: 3,
    });
    for (const record of results) {
        if (!record.isCurrent) continue;
        if (record.sensitivity === 'restricted') continue; // sección 30: nunca
        if (record.confidence < MEMORY_TIME_CONFIDENCE_FLOOR) continue;
        const parsed = parseDateFromText(record.objectValue, now, timezone);
        if (parsed) return { date: parsed.date, memoryId: record.id, canonicalText: record.canonicalText };
    }
    return null;
}

async function planCreateCommitment(objective: AgentObjective, input: AgentPlannerInput, personal: boolean): Promise<DraftOutcome> {
    const title = objective.targetEntities.entityHints[0];
    if (!title) {
        return { steps: [], blockingAmbiguities: [{ field: 'title', kind: 'blocking', reason: 'No identifiqué qué quieres agendar.' }] };
    }

    const timezone = resolveTimeZone(input.timezone);
    let parsed = parseDateFromText(objective.sourceUtterance, input.now, timezone);
    let dateFromMemory: MemoryDateResolution | null = null;
    if (!parsed) {
        dateFromMemory = await tryResolveDateFromMemory(input.actorUserId, title, input.now, timezone);
        if (dateFromMemory) parsed = { date: dateFromMemory.date, textRef: dateFromMemory.canonicalText };
    }
    if (!parsed) {
        return { steps: [], blockingAmbiguities: [{ field: 'dueAt', kind: 'blocking', reason: 'No indicaste una fecha/hora para este compromiso.' }] };
    }

    let responsiblePersonId: string | null = null;
    let responsibleDisplayName: string | null = null;
    const responsibleHint = personal ? null : objective.constraints.responsibleHint;
    if (responsibleHint) {
        const result = await resolvePersonHint(input.actorUserId, responsibleHint, input.conversationId);
        if (!result.resolved || result.ambiguous) {
            return {
                steps: [], blockingAmbiguities: [{
                    field: 'responsible', kind: 'blocking',
                    reason: result.ambiguous ? `Hay más de una persona que coincide con "${responsibleHint}".` : `No encontré a nadie llamado "${responsibleHint}" en tu red autorizada.`,
                    candidates: result.candidates.map((c) => ({ id: c.id, label: c.displayName })),
                }],
            };
        }
        responsiblePersonId = result.resolved.id;
        responsibleDisplayName = result.resolved.displayName;
    }

    const step = buildStep({
        toolId: 'create_commitment',
        operation: responsibleDisplayName
            ? `Proponer compromiso "${title}" a ${responsibleDisplayName}`
            : `Crear compromiso "${title}"`,
        args: { title, dueAt: parsed.date.toISOString(), responsiblePersonId, conversationId: input.conversationId ?? null },
        expectedEffect: dateFromMemory
            ? `Se creará "${title}" usando una fecha inferida de tu memoria ("${dateFromMemory.canonicalText}"), no de esta solicitud directamente.`
            : `Se creará un nuevo compromiso "${title}".`,
        isShared: !!responsiblePersonId,
        sourceUtteranceSpan: title,
        resolvedFrom: dateFromMemory ? 'memory' : 'user_text',
        canonicalSourceRefs: dateFromMemory ? [{ sourceType: 'memory', sourceId: dateFromMemory.memoryId }] : [],
    });
    if (dateFromMemory) {
        step.preconditions.push('La fecha proviene de una preferencia registrada en memoria, no de una fecha explícita en esta solicitud.');
    }
    return { steps: [step], blockingAmbiguities: [] };
}

async function planRescheduleOrCompleteOrRespond(objective: AgentObjective, input: AgentPlannerInput): Promise<DraftOutcome> {
    const hint = objective.targetEntities.entityHints[0];
    const weakReferentHint = !hint || /^(?:lo|la|eso|esto|ella|[ée]l)$/iu.test(hint.trim());
    let resolvedFromContext = false;
    let candidates: RetrievalCommitment[];
    if (weakReferentHint) {
        const referents = (input.contextReferents || []).filter((referent) =>
            referent.actorScope === input.actorUserId
            && referent.canonicalEntityType === 'commitment'
            && referent.confidence >= 0.9
            && Date.parse(referent.expiresAt) > input.now.getTime()
        );
        const ids = [...new Set(referents.map((referent) => referent.canonicalEntityId))];
        if (ids.length !== 1) {
            return { steps: [], blockingAmbiguities: [{
                field: 'targetEntity',
                kind: 'blocking',
                reason: ids.length > 1
                    ? 'Hay más de un referente actual posible; necesito que nombres el compromiso.'
                    : 'No identifiqué a qué compromiso o propuesta te refieres.',
            }] };
        }
        const referenced = await retrieveVisibleCommitmentById(input.actorUserId, ids[0]);
        candidates = referenced ? [referenced] : [];
        resolvedFromContext = true;
    } else {
        candidates = await resolveEntityHint(input.actorUserId, hint);
    }
    if (candidates.length === 0) {
        return { steps: [], blockingAmbiguities: [], failureMode: 'entity_not_found', failureMessage: resolvedFromContext
            ? 'El compromiso referido ya no está disponible o autorizado.'
            : `No encontré ningún compromiso o propuesta que coincida con "${hint}".` };
    }
    if (candidates.length > 1) {
        return {
            steps: [], blockingAmbiguities: [{
                field: 'targetEntity', kind: 'blocking', reason: `Hay más de un resultado para "${hint}".`,
                candidates: candidates.map((c) => ({ id: c.id, label: `${c.title} (${c.dueAt ?? 'sin fecha'})` })),
            }],
        };
    }

    const entity = candidates[0];
    const isProposal = entity.entityType === 'commitment_proposal';
    const isShared = isEntityShared(entity);
    const sourceRefs = [{ sourceType: entity.entityType, sourceId: entity.id }];
    const entityResolutionSource = resolvedFromContext ? 'canonical_context' as const : 'entity_resolution' as const;
    const sourceSpan = hint || undefined;

    if (objective.objectiveType === 'respond_to_existing_proposal') {
        if (!isProposal) {
            return { steps: [], blockingAmbiguities: [], failureMode: 'unsupported_capability', failureMessage: 'Responder aceptar/rechazar directamente sobre un commitment canónico (no una proposal pendiente) todavía no está soportado.' };
        }
        if (!entity.actorCanRespond) {
            return { steps: [], blockingAmbiguities: [], failureMode: 'not_authorized', failureMessage: 'No te corresponde responder a esta propuesta (ya respondiste, o no eres un participante requerido).' };
        }
        const decision = objective.constraints.decisionHint ?? 'approve';
        const step = buildStep({
            toolId: 'respond_to_proposal',
            operation: `${decision === 'approve' ? 'Aceptar' : decision === 'reject' ? 'Rechazar' : 'Contraproponer'} "${entity.title}"`,
            args: { proposalId: entity.id, decision, proposedDueAt: null },
            expectedEffect: `Tu respuesta (${decision}) quedará registrada en "${entity.title}".`,
            isShared, sourceUtteranceSpan: sourceSpan, resolvedFrom: entityResolutionSource, canonicalSourceRefs: sourceRefs,
        });
        return { steps: [step], blockingAmbiguities: [] };
    }

    if (objective.objectiveType === 'reschedule_existing_commitment') {
        const timezone = resolveTimeZone(input.timezone);
        let parsed = parseDateFromText(objective.sourceUtterance, input.now, timezone);
        let dateFromMemory: MemoryDateResolution | null = null;
        if (!parsed) {
            dateFromMemory = await tryResolveDateFromMemory(input.actorUserId, entity.title, input.now, timezone);
            if (dateFromMemory) parsed = { date: dateFromMemory.date, textRef: dateFromMemory.canonicalText };
        }
        if (!parsed) {
            return { steps: [], blockingAmbiguities: [{ field: 'newDueAt', kind: 'blocking', reason: 'No indicaste la nueva fecha.' }] };
        }
        if (isProposal) {
            if (!entity.actorCanRespond) {
                return { steps: [], blockingAmbiguities: [], failureMode: 'not_authorized', failureMessage: 'No te corresponde proponer una nueva fecha en esta propuesta.' };
            }
            const step = buildStep({
                toolId: 'respond_to_proposal',
                operation: `Contraproponer nueva fecha para "${entity.title}"`,
                args: { proposalId: entity.id, decision: 'counter_propose', proposedDueAt: parsed.date.toISOString() },
                expectedEffect: `Se propondrá una nueva fecha para "${entity.title}", pendiente de que la otra parte responda.`,
                isShared, sourceUtteranceSpan: sourceSpan, resolvedFrom: entityResolutionSource, canonicalSourceRefs: sourceRefs,
            });
            return { steps: [step], blockingAmbiguities: [] };
        }
        const isOwnerOrAssignee = entity.ownerUserId === input.actorUserId || entity.assignedToUserId === input.actorUserId;
        if (!isOwnerOrAssignee) {
            return { steps: [], blockingAmbiguities: [], failureMode: 'not_authorized', failureMessage: `No eres el responsable de "${entity.title}", así que no puedes reprogramarlo.` };
        }
        if (!COMMITMENT_TRANSITION_TABLE.counter_propose.validFromStatuses.includes(entity.status)) {
            return { steps: [], blockingAmbiguities: [], failureMode: 'invalid_lifecycle', failureMessage: `"${entity.title}" está en estado "${entity.status}" — no se puede reprogramar desde ahí.` };
        }
        const step = buildStep({
            toolId: 'reschedule_commitment',
            operation: `Reprogramar "${entity.title}"`,
            args: { commitmentId: entity.id, newDueAt: parsed.date.toISOString() },
            expectedEffect: dateFromMemory
                ? `"${entity.title}" se moverá a una fecha inferida de tu memoria ("${dateFromMemory.canonicalText}"), no de esta solicitud directamente.`
                : `"${entity.title}" pasará a tener una nueva fecha propuesta.`,
            isShared, sourceUtteranceSpan: sourceSpan,
            resolvedFrom: dateFromMemory ? 'memory' : entityResolutionSource,
            canonicalSourceRefs: dateFromMemory ? [...sourceRefs, { sourceType: 'memory', sourceId: dateFromMemory.memoryId }] : sourceRefs,
        });
        if (dateFromMemory) {
            step.preconditions.push('La fecha proviene de una preferencia registrada en memoria, no de una fecha explícita en esta solicitud.');
        }
        return { steps: [step], blockingAmbiguities: [] };
    }

    // complete_existing_commitment
    if (isProposal) {
        return { steps: [], blockingAmbiguities: [], failureMode: 'invalid_lifecycle', failureMessage: `"${entity.title}" todavía es una propuesta pendiente — no se puede "completar" hasta que se apruebe y se convierta en un compromiso.` };
    }
    const isOwnerOrAssignee = entity.ownerUserId === input.actorUserId || entity.assignedToUserId === input.actorUserId;
    if (!isOwnerOrAssignee) {
        return { steps: [], blockingAmbiguities: [], failureMode: 'not_authorized', failureMessage: `No eres el responsable de "${entity.title}", así que no puedes completarlo.` };
    }
    if (!COMMITMENT_TRANSITION_TABLE.resolve.validFromStatuses.includes(entity.status)) {
        return { steps: [], blockingAmbiguities: [], failureMode: 'invalid_lifecycle', failureMessage: `"${entity.title}" está en estado "${entity.status}" — no se puede completar desde ahí.` };
    }
    const step = buildStep({
        toolId: 'complete_commitment',
        operation: `Completar "${entity.title}"`,
        args: { commitmentId: entity.id, resolutionResult: objective.desiredOutcome || 'Completado desde el planner.' },
        expectedEffect: `"${entity.title}" quedará marcado como resuelto.`,
        isShared, sourceUtteranceSpan: sourceSpan, resolvedFrom: entityResolutionSource, canonicalSourceRefs: sourceRefs,
    });
    return { steps: [step], blockingAmbiguities: [] };
}

export async function planObjective(input: AgentPlannerInput): Promise<DraftOutcome> {
    const outcome = await planObjectiveDraft(input);
    if (outcome.steps.length === 0) return outcome;
    return { ...outcome, steps: canonicalizeStepIds(outcome.steps) };
}

async function planObjectiveDraft(input: AgentPlannerInput): Promise<DraftOutcome> {
    const { objective } = input;
    tracePlan(input.traceId, 'OBJECTIVE', { objectiveType: objective.objectiveType, source: objective.source, confidence: objective.confidence });

    switch (objective.objectiveType) {
        case 'communicate_message':
        case 'communicate_and_wait':
            return planCommunicate(objective, input);
        case 'create_commitment_or_proposal':
            return planCreateCommitment(objective, input, false);
        case 'create_personal_commitment':
            return planCreateCommitment(objective, input, true);
        case 'reschedule_existing_commitment':
        case 'complete_existing_commitment':
        case 'respond_to_existing_proposal':
            return planRescheduleOrCompleteOrRespond(objective, input);
        case 'unsupported':
        default:
            return { steps: [], blockingAmbiguities: [], failureMode: 'unsupported_capability', failureMessage: 'I can\'t plan an action for that request yet — I can only preview communicate/create/reschedule/complete/respond actions today.' };
    }
}

export function requiredConfirmationsFor(steps: AgentPlanStep[]): ConfirmationPolicy[] {
    return Array.from(new Set(steps.map((s) => s.confirmationRequirement))).filter((c) => c !== 'none');
}

export function toClarificationQuestions(ambiguities: AgentObjectiveAmbiguity[]): ClarificationQuestion[] {
    return ambiguities.filter((a) => a.kind === 'blocking').map((a) => ({
        field: a.field,
        question: a.reason,
        options: a.candidates,
    }));
}
