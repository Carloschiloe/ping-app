# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_STAGING_LIVE_CANDIDATE_PUBLISHED_IOS_BUILD_BLOCKED
ACTIVE_TASK: "Obtain the missing iOS internal-distribution credentials for the staging bundle, then create the staging iPhone build and collect the first real provider/device measurement without selecting a winner from documentation alone."
LAST_CERTIFIED_SHA: "b512ab7abe2d1c14ea4be8f97d0bffc0786bf644 (run 36468278881: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: b512ab7abe2d1c14ea4be8f97d0bffc0786bf644
STAGING_DEPLOYED_SHA: "b512ab7abe2d1c14ea4be8f97d0bffc0786bf644 (run 36468278881; /api/health ok/db connected/commit b512ab7/deployment_marker ping-backend-staging; artifact ping-staging-evidence-b512ab7abe2d1c14ea4be8f97d0bffc0786bf644, id 10990102488)"
KNOWN_FAILURES: "No failure in the current strong staging sequence. Prior write-path demonstrative-person ambiguity defect is corrected and the exact E2E now returns safe clarification while preserving the active objective and clearing the stale plan digest. Broad repository test execution still has pre-existing local Supabase/test-environment failures before test execution; this does not invalidate the focused gate."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution (missing Supabase URL/service-role configuration and an unavailable test cleanup export); focused M7 tests and build pass. Legacy remains."
SECURITY_DEBT: "The owner-confirmed private staging diagnostic is recorded without secrets. Staging-only GitHub/Render controls remain in use; production secrets and data are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: EAS authenticated as carloschiloe, but no iOS distribution credentials are available for internal bundle com.carloschiloe.ping.staging. The candidate is deployed and healthy in staging; the cloud build cannot start until those Apple/EAS credentials exist. M7 is closed; production remains outside the loop."
NEXT_ACTION: "Create/attach the iOS distribution certificate and provisioning profile for com.carloschiloe.ping.staging in EAS, rerun the staging-ios build, then collect automatic latency/quality/interruption/privacy/cost/fallback evidence before selecting the adapter."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral contract/offline invariants implemented; staging-only realtime_webrtc_core_bridge candidate and sanitized telemetry added; provider winner remains unselected pending physical evidence"
M8_SPIKE_EVIDENCE: "Run 36468278881; quality/deploy/health/authenticated E2E PASS for b512ab7abe2d1c14ea4be8f97d0bffc0786bf644; artifact ping-staging-evidence-b512ab7abe2d1c14ea4be8f97d0bffc0786bf644 (id 10990102488)."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "EAS build staging-ios reached remote credential resolution but stopped because no iOS distribution credentials suitable for internal distribution were available for com.carloschiloe.ping.staging. Spoken output and barge-in still require the resulting iPhone build; Expo Go cannot prove those properties."
EVIDENCE: "Run 36468278881 passed quality, exact staging deploy/health and authenticated E2E for b512ab7; artifact 10990102488. Offline M8 contract/live-voice tests and backend/mobile TypeScript pass. EAS account carloschiloe is authenticated; no credentials were created or changed by the agent."
OPTIONS: "In EAS, create/attach the iOS distribution certificate and provisioning profile for com.carloschiloe.ping.staging, then rerun the authorized staging-ios build; or defer the live-voice spike."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Open EAS iOS credentials for project mobile and create/attach internal-distribution credentials for com.carloschiloe.ping.staging; then the agent can rerun the staging-ios build and the user only needs to open the generated app and speak."
```
