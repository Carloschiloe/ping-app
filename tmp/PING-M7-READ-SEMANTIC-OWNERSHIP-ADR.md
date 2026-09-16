# PING M-7 — READ Semantic Ownership ADR

Status: proposed architecture decision; audit only
Branch: `codex/staging-beta`
Audited HEAD: `4591b98d945b21f6b0f6f807972d498a8d788f5f`

## Decision

Separate user-expressed READ meaning from Core query planning:

`Semantic producer -> Core resolutions -> Core Read Query Planner -> Retrieval`

The semantic checkpoint owns the meaning that cannot be recovered after the
utterance is gone. The Read Query Planner owns the canonical, executable query
shape derived from that meaning plus authorized identities, temporal facts,
domain state, and policy.

Neither layer owns presentation, claims, citations, authorization, execution,
or retrieval results.

The existing legacy `AgentContext` is evidence of current behavior, not the
ownership boundary. Its fields must be split conceptually before a V3-native
READ path is wired.

## Ownership matrix

| Fact | Canonical owner | Rule |
| --- | --- | --- |
| User READ domain (`commitment`, `people`, `messages`, etc.) | Semantic understanding | Meaning expressed by the turn; no canonical IDs. |
| User query shape (focused, collection/list, count, historical/lifecycle) | Semantic understanding | Must survive the checkpoint; never infer from result count. |
| Requested relationship (current state, lifecycle transition, proposal status, message search, etc.) | Semantic understanding | Describes what the user asks, not whether evidence proves it. |
| Entity/person hints | Semantic understanding | Hints only; never IDs or authorization. |
| Temporal role/fact expressed (date, time, target offset, duration) | Semantic understanding | `TemporalFact` carries the normalized temporal meaning. |
| Canonical query kind/cardinality | Core Read Query Planner | Deterministic normalization of semantic query shape and supported domain rules. |
| Canonical person identity | Person/Core resolution | Resolution against the authorized universe. |
| Canonical commitment/proposal/message/conversation target | Core resolution + Query Planner | Resolution chooses identity; planner places it in the query. |
| Authorized conversation/resource scope | Core authorization/retrieval boundary | Never inferred from a name or model output. |
| Resolved temporal value/range/instant | Temporal Core | Planner consumes it; never reparses it. |
| Current canonical state | Retrieval/domain Core | Retrieved state, never semantic interpretation. |
| Proposal participant/state facts | Retrieval/domain Core | Planner may request a supported relationship; data proves the result. |
| Evidence relationship constraints | Core Read Query Planner | Defines what a responsive source must prove. |
| Concrete returned source identities | Retrieval result | Sources do not define the question. |
| Required source refs | Derived after canonical query + retrieval | A coverage/evidence result, not an input semantic fact. |
| Claims/citations/presentation prose | Future presentation/finalization boundary | Never semantic authority. |

## What Semantic V3 already owns

`NormalizedSemanticTurnV3` correctly carries provider-neutral facts such as:

- read/write/lifecycle/slot-answer kind;
- broad domain;
- objective type;
- completeness and ambiguity signals;
- entity hints and slots;
- lifecycle command/target;
- temporal fact;
- confidence and source metadata.

It correctly does not carry canonical IDs, retrieval results, authorization,
current state, evidence refs, or execution decisions.

## Facts missing from current V3

The following are required for a V3-native READ query but are not currently
represented explicitly:

- query shape/cardinality intent (`focused`, `collection`, `count`);
- requested lifecycle transition/event;
- proposal relationship/focus (`waiting for others`, `needs my response`,
  `pending response from person`);
- message/conversation relationship requested (search text, conversation
  context, sender/participant relationship);
- explicit historical/current relationship where it is not derivable from the
  domain and lifecycle fields;
- a general read-target shape for non-commitment targets;
- temporal query role (filter range, occurrence-time question, target date,
  or elapsed duration).

These are not canonical database facts. They are user meaning and therefore
cannot safely be invented later by the Query Planner.

## Cardinality decision

Cardinality has two stages, not two authorities:

1. Semantic understanding preserves the user’s expressed query shape: list,
   focused lookup, count, or historical/lifecycle lookup.
2. Core Query Planning deterministically normalizes that shape with the
   supported domain and explicit precedence rules into canonical cardinality.

The planner may derive `exhaustive_list` from an explicit collection shape or
from a canonical proposal/overdue query rule already represented in structured
semantics. It may not inspect result count or raw text. A focused historical
question remains focused even when its domain is `commitment` or `historical`.

Repository examples include:

- “¿Qué compromisos tengo?” -> exhaustive list;
- “¿Cuántos compromisos tengo?” -> count;
- “¿Qué pasó con entrenar?” -> focused lookup;
- “¿Cuándo completamos lo de entrenar?” -> focused historical lifecycle
  lookup;
- “¿Qué estoy esperando?” -> exhaustive proposal relationship query.

## Lifecycle ownership

The semantic layer owns: “the user requested completion/cancellation/
acceptance/etc.” This is a requested relationship, not proof.

The Query Planner owns the canonical query constraint that the target must be
identified and evidence must contain the requested event type. Retrieval owns
the actual event/state facts. A cancellation event cannot satisfy a requested
completion query merely because it belongs to the same commitment.

The existing `AgentContext.requestedTransition` and
`requestedTransitionTargetCommitmentId` demonstrate the correct separation,
but they are legacy output fields and are not yet carried by V3.

## Proposal ownership

The semantic layer owns the requested relationship/focus. Core/Retrieval owns
canonical proposal participation and state, including actor response ability,
pending responder IDs, and approval state.

The planner may request only relationships represented by the product contract.
It must not convert a generic commitment query into a proposal query from
retrieval results or model wording.

## Target ownership

Semantic understanding owns only target shape and hints. Person/Core
resolution owns canonical person identity. Entity/Core resolution owns
canonical commitment, proposal, conversation, message, or other target IDs.

The planner combines those resolved identities with semantic query shape. It
must not recover a target through title/name matching after the checkpoint.

## Temporal ownership

Semantic understanding owns the normalized temporal meaning (`TemporalFactV3`):
absolute date, relative date, clock time, target offset, duration, or weekday.

Temporal Core owns resolution into a date, range, instant, timezone-aware value,
or an explicit ambiguous/invalid/insufficient result. The Query Planner owns
only the query role that the semantic fact requests, such as filtering by a
date range versus requiring an event occurrence time. It never reparses dates.

## Person, message, and conversation ownership

The semantic layer may say “about person X”, “messages”, “this conversation”,
or “what did we discuss”. It cannot assert that every retrieved item relates
to X.

Person/Core resolution supplies the authorized person identity. Retrieval must
prove message sender, conversation membership, participant, or other
relationship from structured data. A message’s appearance in a person-scoped
result is not itself proof of a person relationship.

The same rule applies to attachments and transcriptions: `messageId` and
`conversationId` prove containment where those canonical links exist, but do
not prove an additional person or semantic relationship without more lineage.

## Evidence constraints

The Query Planner owns the required relationship shape, for example:

- existence of a canonical commitment;
- current state of that commitment;
- exact lifecycle transition for that commitment;
- canonical proposal participation relation;
- message text within an approved conversation scope;
- attachment/transcription belonging to a canonical message or conversation.

Retrieval returns sources. A later evidence evaluator determines whether those
sources satisfy the planner’s relationship constraint. Source count and source
existence are never substitutes for relationship support.

## Forbidden derivations

After the semantic checkpoint, Core must never:

- parse raw utterance text to recover cardinality or lifecycle meaning;
- call an LLM to reinterpret query shape or relationship;
- choose a target by lexical title/name overlap;
- infer person/message/proposal relationships from result inclusion;
- infer cardinality from number of returned rows;
- let a different lifecycle event satisfy the requested event;
- treat a valid source reference as proof of every statement about that source.

## Semantic checkpoint and versioning

Current persisted semantic checkpoints are versioned and V3 is already a
provider-neutral contract. The missing facts are semantic, not canonical
resolution facts. They should not be silently reconstructed downstream.

Recommendation: introduce a versioned V4 semantic contract for the expanded
READ query-shape/relationship facts before live V3-native READ wiring. V3 may
remain readable for compatibility, but a V3 checkpoint must not be accepted as
complete input to the canonical READ Query Planner when these facts are
required. Since the V3-native path is not live, no dual-write migration is
required yet; the future cutover can produce V4 only and reject or safely
degrade incomplete V3 reads.

This ADR does not change V3, persistence, retrieval, or live routing.

## Future Core Read Query Planner contract

The future planner should accept only structured inputs:

- Semantic V4 READ meaning;
- Core person/entity resolutions;
- Temporal Core result;
- approved READ scope;
- deterministic policy/domain capability facts.

It should produce a discriminated canonical query containing the normalized
domain/query shape, cardinality, canonical target where present, requested
relationship, temporal role/value, authorized scope, and required evidence
relationship constraints. It should not contain presentation prose, raw input,
model reasoning, retrieval rows, authorization tokens, or execution state.

## Consequences

Positive:

- every future READ query field has one owner;
- semantic meaning survives the checkpoint without importing canonical IDs;
- Core remains authoritative for identity, state, policy, and evidence truth;
- presentation can consume a query/evidence contract without reparsing text;
- historical and proposal safety rules remain explicit.

Costs:

- a V4 semantic contract is required before full V3-native READ coverage;
- legacy AgentContext cannot be used as the V3 contract by simple renaming;
- query-shape and evidence-relationship tests must precede implementation.

## Certification

Ownership is resolved for the audited concepts. The canonical V3 READ Query
Contract itself is **not certified yet**, because the current V3 checkpoint
lacks the semantic facts listed above and no planner implementation may invent
them.
