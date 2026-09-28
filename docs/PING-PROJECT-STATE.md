# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M7
CURRENT_STATE: STAGING_AUTOMATED_CERTIFICATION_PASS_PRIVATE_DB_EVIDENCE_PENDING
ACTIVE_TASK: "Obtain the non-secret Render startup-log evidence for PING_M7_PRIVATE_DB_CHECK=PASS; keep M7 open until that gate is verified."
LAST_CERTIFIED_SHA: "08ada9417944364e0082a794fbe5d16dbd487d8e (staging run 36442340938: quality, exact deploy, health and authenticated E2E PASS)"
STAGING_REMOTE_SHA: 08ada9417944364e0082a794fbe5d16dbd487d8e
STAGING_DEPLOYED_SHA: "08ada9417944364e0082a794fbe5d16dbd487d8e (run 36442340938; exact SHA health gate PASS)"
KNOWN_FAILURES: "The automated staging circuit now passes. Earlier failures were harness defects (missing E2E dependencies, banned reusable identity, and durable identity cleanup) and were corrected. Private startup-log evidence remains unverified; the full repository suite still has pre-existing external/environment failures."
TECHNICAL_DEBT: "The full repository test command contains pre-existing environment/external-suite failures and is not currently a reliable staging gate. Legacy remains. The staging E2E smoke still needs stronger semantic assertions before a final M7 completion candidate."
SECURITY_DEBT: "Private staging DB startup evidence has not been independently observed from Render logs. GitHub environment branch policy, staging Supabase secrets and the staging-only Render hook are configured; production secrets are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: Render dashboard/log access is needed to verify the non-secret startup line PING_M7_PRIVATE_DB_CHECK=PASS; no Render API/log credential is available to this agent."
NEXT_ACTION: "In Render, open ping-backend-staging, inspect the latest deployment logs after startup, and verify the exact line PING_M7_PRIVATE_DB_CHECK=PASS without copying any secret."
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
