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
