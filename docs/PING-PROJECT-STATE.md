# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_STAGING_LIVE_CANDIDATE_READY_FOR_REAL_MEASUREMENT
ACTIVE_TASK: "Publish the guarded staging live-voice candidate, produce the staging iPhone build, then collect the first real provider/device measurement without selecting a winner from documentation alone."
LAST_CERTIFIED_SHA: "c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8 (run 36460732619: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8
STAGING_DEPLOYED_SHA: "c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8 (run 36460732619; health/SHA gate PASS, artifact ping-staging-evidence-c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8, id 10987356720; M8 spike-only change, no runtime provider enabled)"
KNOWN_FAILURES: "No failure in the current strong staging sequence. Prior write-path demonstrative-person ambiguity defect is corrected and the exact E2E now returns safe clarification while preserving the active objective and clearing the stale plan digest. Broad repository test execution still has pre-existing local Supabase/test-environment failures before test execution; this does not invalidate the focused gate."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution (missing Supabase URL/service-role configuration and an unavailable test cleanup export); focused M7 tests and build pass. Legacy remains."
SECURITY_DEBT: "The owner-confirmed private staging diagnostic is recorded without secrets. Staging-only GitHub/Render controls remain in use; production secrets and data are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: the staging live candidate must be installed/opened once on an iPhone-capable build; Expo Go cannot prove spoken output or barge-in. M7 is closed; production remains outside the loop."
NEXT_ACTION: "Run quality gates, publish the live candidate only to staging, request the staging iPhone build, then collect automatic latency/quality/interruption/privacy/cost/fallback evidence before selecting the adapter."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral contract/offline invariants implemented; staging-only realtime_webrtc_core_bridge candidate and sanitized telemetry added; provider winner remains unselected pending physical evidence"
M8_SPIKE_EVIDENCE: "Run 36460732619; artifact ping-staging-evidence-c62c94aa5bdab601e8e2d8c2bc720c023f22dbe8 (id 10987356720)."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "The staging candidate is prepared, but real spoken output and barge-in require an iPhone-capable build; Expo Go cannot prove those properties."
EVIDENCE: "M8 provider-neutral contract (4/4) and live candidate/telemetry offline tests pass; prior staging quality/deploy/health/SHA/authenticated E2E passed on run 36460732619 for c62c94a. No production path or provider winner is enabled."
OPTIONS: "Open the staging iPhone build once for the controlled conversation, or defer the live-voice spike."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Open the generated staging iPhone build; Ping will automatically capture the read-only turn, follow-up, interruption, confirmation and fallback telemetry without requiring manual technical measurement."
```
