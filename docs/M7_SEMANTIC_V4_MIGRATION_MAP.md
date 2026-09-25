# M-7 Semantic V4 migration map

Status: architecture inventory only. No runtime behavior changed by this document.

## Fase 1 implementation boundary

`canonicalSemanticProducer.service.ts` is now the shared V4 boundary for
prompt construction, provider schema, provider-schema hash, parsing and
runtime normalization. The frontier benchmark injects only the model name and
uses that same boundary. `agentSemanticShadow.service.ts` is observational and
is disabled unless `PING_SEMANTIC_V4_SHADOW=true` in local/staging; production
always remains disabled.

## Caller inventory (current branch)

| Component | Direct callers / use | Classification | Phase 1 treatment |
|---|---|---|---|
| `agentSemanticInterpreter.service.ts` | `agentTurnCore.service.ts` general-turn route | LINGUISTIC_SEMANTICS plus Core admission safety | Characterized; not removed |
| `agentInputInterpreter.service.ts` | `agentSemanticInterpreter`, `agentContextBuilder`, tests | LINGUISTIC_SEMANTICS; also output validation/fallback | Characterized; retained |
| `agentObjectiveInterpreter.service.ts` | `agentSemanticInterpreter`, planner/dialogue continuation | LINGUISTIC_SEMANTICS plus objective validation boundary | Characterized; retained |
| `agentDialogueContinuation.service.ts` | `agentTurnCore.service.ts` dialogue-first and plan correction paths | CORE_INVARIANT with linguistic detection mixed in | Mapped; no deletion |
| `agentReadFollowupReferent.service.ts` | `agentTurn.service.ts` read follow-up adapter | CORE_INVARIANT: reauthorization and scoped referent | Mapped; no deletion |
| `TARGETED_FIRST_READ` | `agentTurn.service.ts` single legacy referent-capture gate | LINGUISTIC_SEMANTICS | Characterized in map; no removal |
| `TIME_HINT_PATTERN` | `agentObjectiveInterpreter.service.ts`, dialogue correction | LINGUISTIC_SEMANTICS after extraction; Core validates result | Characterized in map; no removal |
| explicit confirmation phrase set | `agentDialogueContinuation.service.ts` | SAFETY_POLICY with linguistic admission | Preserved; V4 cannot authorize |
| person/entity regexes and date parsers | input/objective interpreters | TECHNICAL_VALIDATION or Core resolution depending caller | Preserved; candidate for later cutover only |

No legacy component is deleted in Phase 1. The normal `/agent/turn` response
remains legacy-governed; V4 is added only as an opt-in observation path.

## Target

One language-understanding boundary:

`user turn -> Semantic Turn V4 -> Core resolution/policy -> planner/read executor -> authorization -> execution`

The model may propose semantic facts. Core owns canonical identity, visibility, authorization, lifecycle legality, confirmation, idempotency, durable state and execution.

## What is actually live today

The normal `/agent/turn` path still enters `agentTurn.service.ts -> agentTurnCore.service.ts`. Core calls `interpretAgentSemanticTurn`, whose default path is the older `LlmInputInterpreter` + `LlmObjectiveInterpreter`. Both retain deterministic linguistic fallbacks/overrides.

The durable general-turn boundary does not switch semantics to V4. It admits the turn with `routingMode: 'legacy'`, restores durable dialogue, then calls the same legacy `runAgentTurn`.

Semantic V4 is live only behind the bounded READ V4 exact-pending-count capability. That path calls `canonicalSemanticProducer.produceV4`, persists the V4 semantic checkpoint, and executes through the V4 read orchestration.

Therefore V4 exists and is proven in a narrow vertical, but it is not yet the general conversational brain.

## Legacy language dependencies to retire

| Area | Current dependency | Why it is legacy language understanding | Replacement |
|---|---|---|---|
| General turn routing | `interpretAgentSemanticTurn` | LLM interpretation can be vetoed/overridden by deterministic linguistic interpreters | V4 `kind/domain/objectiveType` mapped into Core disposition |
| Input understanding | `agentInputInterpreter.service.ts` | large keyword/regex vocabulary | V4 semantic facts; retain only non-linguistic validators |
| Objective understanding | `agentObjectiveInterpreter.service.ts` | deterministic objective parser and regex lifecycle dominance remain active | V4 objective/slots -> Core-owned objective adapter |
| Dialogue escape/new objective | `agentDialogueContinuation.service.ts` | calls deterministic input + old LLM objective interpreter | V4 `independentObjective/continuationLike/kind` plus Core dialogue facts |
| Read follow-up | `agentReadFollowupReferent.service.ts` | calls deterministic interpreter to decide whether follow-up is read-shaped | V4 read meaning + durable authorized referent |
| First-read referent capture | `agentTurn.service.ts` | `TARGETED_FIRST_READ` phrase regex gates referent memory | evidence-backed V4 focused-read result |
| Date correction | dialogue continuation + old date phrase vocabulary | linguistic detection duplicated outside semantic boundary | V4 temporalFact + Core date validation |
| Natural confirmation | old continuation helper | phrase-oriented confirmation recognition | V4 lifecycle/slot semantic fact + plan digest/authorization checks |

## Components that are NOT legacy and must be preserved

Do not remove merely because they are deterministic:

- authorization and visibility checks;
- canonical person/entity resolution;
- planner and plan validator;
- confirmation requirements and plan digest binding;
- idempotency/admission/commit/reconciliation;
- commitment lifecycle transition legality;
- evidence/citation verification;
- voice-token validation;
- memory truth/write policy;
- date/time canonical validation after semantic extraction;
- durable dialogue checkpointing.

These are Core invariants, not language understanding.

## Migration order

### Gate A — benchmark
Run the frozen frontier benchmark against the current V4 model and candidate model(s). No runtime switch before safety-critical semantic contrasts pass.

### Gate B — V4-to-Core adapter
Create one adapter that converts a validated V4 turn into the existing Core inputs/objective shape. The adapter must not parse natural language. Unknown/ambiguous semantic facts must remain unknown/ambiguous.

### Gate C — shadow mode
For normal `/agent/turn`, produce V4 alongside the current route without affecting user-visible behavior or execution. Record disagreements by semantic dimension. Never log sensitive raw content beyond existing policy.

### Gate D — read cutover
Move read routing/follow-up semantics to V4 while retaining canonical retrieval, authorization and evidence checks. Remove `TARGETED_FIRST_READ` only after equivalent evidence-backed referent behavior is covered.

### Gate E — write-plan cutover
Use V4 for objective/slot proposal. Existing planner, canonical resolution, confirmation and authorization remain authoritative. V4 must never execute directly.

### Gate F — dialogue cutover
Replace linguistic escape/continuation/correction heuristics with V4 semantic fields plus Core dialogue state.

### Gate G — deletion
Only after regression + blind + staging physical tests pass, delete unreachable keyword/regex semantic code and its phrase-specific tests. Keep tests that express product behavior, rewriting them against V4 rather than deleting expectations.

## Deletion rule

A legacy parser is deletable only when:
1. no production caller imports it for semantic routing;
2. its behavior is represented by V4/Core tests;
3. blind paraphrases pass without adding phrase patches;
4. read/write safety contrasts pass;
5. staging physical tests pass;
6. rollback remains possible at the branch/deploy level.

## Immediate blocker

The current V4 producer is hard-coded to `gpt-4o-mini`. Model comparison is intentionally deferred until a real provider key is available in the test environment. Do not change the staging model from inference alone.
