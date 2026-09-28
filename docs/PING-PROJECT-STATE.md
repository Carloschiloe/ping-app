# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M7
CURRENT_STATE: STAGING_SEMANTIC_CERTIFICATION_IN_PROGRESS
ACTIVE_TASK: "Certify the complete objective-switch, return, correction, deferral and ambiguity sequence on the exact deployed staging SHA; keep M7 open until the full semantic E2E and safety gates pass."
LAST_CERTIFIED_SHA: "0f31aef118922c65ddbaab691ac86ecc4eca82dc (quality and exact staging deploy/health PASS; strong semantic E2E exposed demonstrative-person ambiguity defect)"
STAGING_REMOTE_SHA: 0f31aef118922c65ddbaab691ac86ecc4eca82dc
STAGING_DEPLOYED_SHA: "0f31aef118922c65ddbaab691ac86ecc4eca82dc (run 36450755682; health/SHA gate PASS, semantic E2E FAIL at ambiguity handling)"
KNOWN_FAILURES: "Run 36450755682 confirms objective return, date correction, confirmation binding and pending-plan deferral, but exposes a fourth real dialogue defect: demonstrative person references were not recognized as unresolved anaphora, allowing a plan without an authorized person instead of asking for clarification. The correction generalizes the Core grammatical reference detector. The private staging diagnostic PING_M7_PRIVATE_DB_CHECK=PASS was confirmed by the owner."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution (missing Supabase URL/service-role configuration and an unavailable test cleanup export); focused M7 tests and build pass. Legacy remains."
SECURITY_DEBT: "The owner-confirmed private staging diagnostic is recorded without secrets. Staging-only GitHub/Render controls remain in use; production secrets and data are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "No human gate currently. M7 remains open because the strong staging semantic E2E fails on objective return; the fix must pass quality, exact SHA health and the real staging assertions."
NEXT_ACTION: "Commit and publish the grammatical demonstrative-person ambiguity correction only to codex/staging-beta, then let the certification workflow redeploy and retest the full semantic sequence."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: NO
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "The deploy hook is now configured and the permanent circuit is operational, but this session has no authorized Render log/API access to observe the private DB startup diagnostic."
EVIDENCE: "Run 36442340938: quality PASS, exact staging deploy/health PASS, authenticated /agent/turn E2E PASS, temporary identity cleanup PASS, conversation tombstone PASS, activeMessages=0, agentWriters=0, commitmentMutations=0, messagesCreated=0."
OPTIONS: "Open the latest ping-backend-staging deployment logs and verify only PING_M7_PRIVATE_DB_CHECK=PASS. Do not paste the URL, database URL or any secret into chat."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "After the exact log line is verified, update this state and the queue; if it is absent, keep M7 open and diagnose only the private staging configuration."
```
