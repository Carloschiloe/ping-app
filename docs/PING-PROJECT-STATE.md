# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_VOICE_SPIKE_READY_FOR_REAL_MEASUREMENT
ACTIVE_TASK: "Run the first real live-voice provider/device measurement against the frozen session contract; do not select a provider from documentation alone."
LAST_CERTIFIED_SHA: "c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8 (run 36460732619: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8
STAGING_DEPLOYED_SHA: "c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8 (run 36460732619; health/SHA gate PASS, artifact ping-staging-evidence-c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8, id 10987356720; M8 spike-only change, no runtime provider enabled)"
KNOWN_FAILURES: "No failure in the current strong staging sequence. Prior write-path demonstrative-person ambiguity defect is corrected and the exact E2E now returns safe clarification while preserving the active objective and clearing the stale plan digest. Broad repository test execution still has pre-existing local Supabase/test-environment failures before test execution; this does not invalidate the focused gate."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution (missing Supabase URL/service-role configuration and an unavailable test cleanup export); focused M7 tests and build pass. Legacy remains."
SECURITY_DEBT: "The owner-confirmed private staging diagnostic is recorded without secrets. Staging-only GitHub/Render controls remain in use; production secrets and data are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: real bidirectional voice evidence needs an iPhone-capable live-voice build and an authorized staging provider session. Expo Go currently exercises only batch capture/transcription and cannot prove spoken output or barge-in. M7 is closed; production remains outside the loop."
NEXT_ACTION: "Owner opens the staging voice-capable iPhone build for the controlled measurement; then the agent records real latency, quality, interruption, privacy, cost and fallback evidence before selecting the adapter."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral contract and offline invariants implemented; staging CI/deploy/E2E passed on c62c94a and state wrapper 11d6a05; no live provider selected; no runtime voice path changed"
M8_SPIKE_EVIDENCE: "Run 36460732619; artifact ping-staging-evidence-c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8 (id 10987356720)."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "M7 was accepted externally. A new architecture/product gate is required before implementing M8 Voice and Natural Conversation."
EVIDENCE: "M7_ACCEPTED by external architect/product review. Run 36455165934 / artifact ping-staging-evidence-8bbd6b58a293865cfb12c5c7afaaa8da003e3525 (id 10985332620): exact deployed SHA 8bbd6b5, health gate PASS, eight-turn strong semantic E2E PASS, safe ambiguity clarification, active objective preserved, pending plan invalidated, agentWriters=0, commitmentMutations=0, messagesCreated=0, temporary identity cleanup PASS. Owner confirmation: PING_M7_PRIVATE_DB_CHECK=PASS. Prior run 36442340938 supplies authenticated persistence/reload/conversation/tombstone safety evidence."
OPTIONS: "Accept the proposed M8 scope, revise its product/architecture boundaries, or defer M8."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Review docs/M8-ARCHITECTURE-PRODUCT-PROPOSAL.md; do not implement M8, merge to main or deploy production before acceptance."
```
