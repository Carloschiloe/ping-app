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

## Ledger deep validation

A separate two-conversation, ten-turn ledger sequence was started with the
same read-only Core boundary. It stopped after three provider turns because
the provider returned `finish_reason=length`; no retry was made. Three raw
outputs and three Core result records were persisted, with no side effects.
The requested full ledger sequence therefore remains **not certified**. This
is a provider truncation/budget observation, not evidence of a Core or ledger
mutation defect.
