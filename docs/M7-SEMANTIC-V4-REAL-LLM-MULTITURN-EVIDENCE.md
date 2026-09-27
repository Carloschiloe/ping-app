# M7 Semantic V4 — Real LLM multi-turn evidence

## Scope

This record covers the local real-provider attempt from `40bcb5f`. It is
separate from the frozen blind evaluation and does not modify its fixtures,
expectations, scoring, Semantic V4, Legacy, Core, staging, or production.

## Result

- Provider/model: `gpt-5.6-sol`.
- Smoke design: one new five-turn conversation, followed by a new matrix of
  twelve conversations and forty-eight turns. The matrix was not started.
- Provider attempts: 2 total, both stopped on the first smoke turn.
- Sanitized provider result: `providerErrorClass=sdk`, `status=none`,
  `code=none`, `message=Connection error.`
- Raw provider outputs persisted: 0. The provider returned no content, so no
  V4 output could be persisted or passed to the adapter/Core.
- Schema validation, normalization, state carryover, disposition, plan,
  ledger validation, and replay: not reached.
- No writers, tools, persistence mutations, memory writes, messages, or
  production dialogue mutations were reached; side effects: 0.

## Interpretation

The failure occurred in the local provider transport before schema parsing.
It is infrastructure/provider connectivity evidence, not evidence of a
Semantic V4, Legacy, Core, or continuity defect. No additional retry is
authorized by this record.

## Harness-only work completed

The runner's module boundary was corrected from CommonJS `require` to the
runtime-compatible dynamic import path. Provider diagnostics now retain only
sanitized class/status/code/message fields. These changes do not alter the
OpenAI request semantics or product code.

## Next gate

Run the existing smoke from a session with confirmed outbound access to the
provider. Only after that smoke completes successfully should the planned
new matrix be considered for execution. Do not treat this blocked attempt as
semantic certification.

## Network-valid execution

The same runner was executed once from the elevated local environment after
DNS, TCP/443, and HTTPS preflight passed.

- Smoke + matrix provider calls: `53`.
- Conversations: `13` total (`1` smoke plus `12` matrix).
- Human turns: `53`.
- Provider errors: `0`.
- `finish_reason=stop`: `53/53`.
- Schema-invalid outputs: `0`.
- V4 normalized outputs: `51/53`.
- Runtime normalization fallbacks: `2/53`, both caused by the same safe
  contract mismatch: `read_request` with `readMeaning=null`, rejected by the
  existing runtime invariant `Semantic V4 read meaning is required`.
- All `53` outputs were persisted in the provider-raw artifact before parse;
  the full V4 artifact contains `53` records.
- Core/shadow first pass: `53/53` reached Core without `shadow_failure`;
  writers, tools, persistence mutations, memory writes, and dialogue mutation
  side effects remained `0`.
- The first run exposed a harness defect: Core first-pass results were held
  only in memory. The harness now persists them separately from the raw V4
  artifact before replay.
- Offline replay of the same `53` persisted outputs was executed twice after
  the run and produced identical structural results, with `0` OpenAI calls and
  `0` side effects. Because the first-pass result file was not present in the
  original run, this is a deterministic offline recomputation/replay check,
  not a byte-for-byte comparison against the lost in-memory snapshot.

The two normalization fallbacks are provider/model semantic failures, not
invented meanings and not Core failures. The runner records the exact raw
provider response and a sanitized normalization error so a future run can be
audited without reissuing this run's calls.

### Normalization adjudication

The two rejected outputs were both `kind=read_request` with
`readMeaning=null`: a reference clarification (`¿Te refieres a eso?`) and an
incomplete message question (`Tengo otra pregunta sobre un mensaje.`). The
runtime invariant in `agentTurnSemanticV4.service.ts` and the read planner's
required dereference make `readMeaning` mandatory for every `read_request`.
The safe classification is therefore a provider/model semantic error exposed
by a contract gap: the flat provider schema permits the invalid cross-field
combination. The normalizer was not relaxed and no meaning was invented.

## Directed ledger validation

A separate two-conversation, ten-turn sequence was executed once with the
same read-only Core boundary. The initial attempt used
`max_completion_tokens=1024` and stopped on turn four with
`finish_reason=length`; the available usage evidence and the absence of a
provider response establish completion-budget exhaustion. The truncated
provider record was not available from that first runner version, so its exact
token usage is not claimed.

The directed run was then executed once with only the completion budget
changed to `2048`. It completed `2` conversations and `10` provider turns,
with `10` raw provider records and `10` Core-result records persisted. The
run used `gpt-5.6-sol`, retained the same prompt/schema/Core boundary, and
had no writers, tools, persistence mutations, memory writes, or external
messages. Dialogue-state mutation is an expected internal continuity effect
and is not counted as an external side effect.

The persisted ledger records were replayed twice offline with `0` OpenAI
calls. Both replay passes were deterministic and reached the read-only Core
resolver/disposition/plan boundary with `0` external side effects. A strict
byte-for-byte comparison against the original persisted state snapshots did
not pass: some snapshots from the original v2 run contain turn-sequence and
clarification-state transitions that the current replay does not reproduce.
This is recorded as an evidence/harness comparability limitation, not
silently converted to a ledger PASS. The ledger deep gate therefore remains
open until the original-run source/runtime fingerprint and state-transition
contract are captured consistently.

## Offline structural follow-up from `46a840a`

### Provider contract

The provider boundary was corrected without changing the canonical runtime
normalizer. The exported Structured Outputs schema is now an object envelope
with a discriminated `turn` union:

- `read_request` requires a non-null, complete `readMeaning` object;
- `write_request`, `slot_answer`, `lifecycle_command`, and `unknown` require
  `readMeaning: null`;
- every branch remains strict, has all properties required, and keeps the
  existing temporal discriminators.

The new provider schema hash is
`eb4b1943a694e7ede930b3739f03cd671c1ae4a7000fd31999577077a1fccaed`.
Historical flat artifacts remain parser-compatible through a private
parser-only legacy schema; they are not accepted as the provider contract.
Offline contract tests pass for valid/invalid `readMeaning` combinations and
all temporal variants. The 53 historical outputs were not rewritten.

### First ledger divergence

The forensic replay located the first mismatch at conversation
`00000000-0000-4000-8000-000000000040`, turn `3`, `Que sea con Paula.`.
Both original and replay entered the turn with an idle ledger at sequence 2.
The persisted snapshot records a clarification state at sequence 4 with an
open `create_commitment_or_proposal` objective and `person_ambiguous` pending.
The current replay reaches the Core shadow `reclarify` disposition but leaves
the legacy dialogue ledger idle at sequence 2 with no open objective.

The divergence is a replay comparability defect, not evidence of a V4/Core
semantic defect. The original runner loads `backend/.env`; the offline replay
does not. On this path `agentTurnCore` may instantiate
`LlmObjectiveInterpreter` while reconciling a person clarification. The
original persisted records contain the V4 output but do not contain the
legacy objective output or the original runtime fingerprint. Therefore the
replay cannot reconstruct the original state transition without either an
external provider call or inventing a missing legacy result. Neither is safe
or permitted for this frozen evidence.

The runtime fingerprint and raw V4 hashes are preserved alongside the ledger
artifacts in `m7-real-llm-ledger.runtime-fingerprint.json`. It records the
source hashes, schema, flags, repository seed, clock, timezone, model, budget,
and the comparability gap without secrets. No product ledger fix was applied
on the basis of this non-comparable replay.

Offline replay remains deterministic across two passes with zero OpenAI calls
and zero external side effects. Strict equivalence to the original snapshots
remains blocked by the missing legacy output/fingerprint capture.
