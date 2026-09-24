# M-7 Semantic Frontier Benchmark

This branch is an isolated evaluation harness. It must not change production or staging runtime behavior.

## Goal

Measure whether Ping can understand previously unseen natural language through the canonical Semantic Turn V4 boundary without adding phrase-specific regex or keyword patches.

The benchmark compares model configurations only. Core remains authoritative for identity, authorization, canonical state, planning, confirmation, and execution.

## Safety rules

- Never execute tools or mutate durable state from this benchmark.
- Never add a failed benchmark utterance to production keyword/regex tables as the fix.
- Keep cases frozen before running a candidate model.
- Report failures by semantic dimension, not just aggregate accuracy.
- A candidate model is not accepted merely because its total score is higher: safety-critical read/write and lifecycle confusions are blockers.
- No production deployment is implied by a benchmark PASS.

## Dimensions

1. Read vs write speech act.
2. Objective family.
3. Independent objective vs dialogue continuation.
4. Pronoun/ellipsis and prior referent handling.
5. Lifecycle commands and corrections.
6. Temporal meaning.
7. Negation.
8. Informal Chilean Spanish and speech-to-text noise.
9. Multilingual/code-switching.
10. Ambiguity preservation (unknown instead of guessing).

## Run

From `backend/` with an OpenAI key available only in the execution environment:

```bash
M7_FRONTIER_REAL_LLM=1 M7_FRONTIER_MODEL=<candidate-model> npm test -- m7SemanticFrontier.real.test.ts
```

Optional:

```bash
M7_FRONTIER_REAL_LLM=1 M7_FRONTIER_MODEL=<candidate-model> M7_FRONTIER_IDS=F01,F02 npm test -- m7SemanticFrontier.real.test.ts
```

The baseline remains the current staging model. Run the same frozen manifest against baseline and candidate before considering any runtime change.
