# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M7
CURRENT_STATE: M7_COMPLETION_CANDIDATE_READY
ACTIVE_TASK: "Hold M7 completion candidate for external architect/product review; do not start M8 until the candidate is accepted."
LAST_CERTIFIED_SHA: "8bbd6b58a293865cfb12c5c7afaaa8da003e3525 (run 36455165934: quality PASS, exact staging deploy/health PASS, authenticated semantic E2E PASS)"
STAGING_REMOTE_SHA: 8bbd6b58a293865cfb12c5c7afaaa8da003e3525
STAGING_DEPLOYED_SHA: "8bbd6b58a293865cfb12c5c7afaaa8da003e3525 (run 36455165934; health/SHA gate PASS, artifact ping-staging-evidence-8bbd6b58a293865cfb12c5c7afaaa8da003e3525, id 10985332620; docs-only wrapper over runtime candidate bdcf94e)"
KNOWN_FAILURES: "No failure in the current strong staging sequence. Prior write-path demonstrative-person ambiguity defect is corrected and the exact E2E now returns safe clarification while preserving the active objective and clearing the stale plan digest. Broad repository test execution still has pre-existing local Supabase/test-environment failures before test execution; this does not invalidate the focused gate."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution (missing Supabase URL/service-role configuration and an unavailable test cleanup export); focused M7 tests and build pass. Legacy remains."
SECURITY_DEBT: "The owner-confirmed private staging diagnostic is recorded without secrets. Staging-only GitHub/Render controls remain in use; production secrets and data are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED for external review of the M7 completion candidate. M7 is not closed and M8 is not authorized."
NEXT_ACTION: "Architect/product owner reviews docs/M7-COMPLETION-CANDIDATE.md and either accepts M7 closure or records a concrete additional requirement."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: NO
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "M7 has reproducible staging evidence sufficient for a completion candidate; milestone closure requires external architect/product review under the permanent protocol."
EVIDENCE: "Run 36455165934 / artifact ping-staging-evidence-8bbd6b58a293865cfb12c5c7afaaa8da003e3525 (id 10985332620): exact deployed SHA 8bbd6b5, health gate PASS, eight-turn strong semantic E2E PASS, safe ambiguity clarification, active objective preserved, pending plan invalidated, agentWriters=0, commitmentMutations=0, messagesCreated=0, temporary identity cleanup PASS. Owner confirmation: PING_M7_PRIVATE_DB_CHECK=PASS. Prior run 36442340938 supplies authenticated persistence/reload/conversation/tombstone safety evidence."
OPTIONS: "Accept M7 closure and authorize a separately scoped M8, or keep M7 open with a documented concrete requirement."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Review docs/M7-COMPLETION-CANDIDATE.md; do not merge to main, deploy production or start M8 before acceptance."
```
