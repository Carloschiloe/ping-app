# Ping — project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_EXPO_GO_CANDIDATE_DEPLOYED_STAGING_GATE_BLOCKED
ACTIVE_TASK: "Make the staging live-voice gate observable, verify the HTTPS WebView client route, then run the first concrete Expo Go iPhone measurement of user-to-Ping voice, Core continuity and barge-in."
LAST_CERTIFIED_SHA: "eb82cefb31466f5d1f3d15e349451c012cf62c70 (run 36473614241: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: eb82cefb31466f5d1f3d15e349451c012cf62c70
STAGING_DEPLOYED_SHA: "eb82cefb31466f5d1f3d15e349451c012cf62c70 (run 36473614241; /api/health ok/db connected/commit eb82cef/deployment_marker ping-backend-staging; live client route probe returned HTTP 404)"
KNOWN_FAILURES: "The public staging probe for /api/agent/voice/live/client returns HTTP 404 while /api/health is healthy. The route is deliberately gated by the staging runtime and M8_LIVE_VOICE_ENABLED; the public response proves the live-voice gate is not observably active, but does not expose which private environment value is absent. No physical Expo Go voice measurement has occurred."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution (missing Supabase URL/service-role configuration and an unavailable test cleanup export); focused M7 tests and build pass. Legacy remains."
SECURITY_DEBT: "The owner-confirmed private staging diagnostic is recorded without secrets. Staging-only GitHub/Render controls remain in use; production secrets and data are not used."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "HUMAN_GATE_REQUIRED: staging live-voice gate is not observably active: GET /api/agent/voice/live/client returns HTTP 404 on deployed eb82cef. Render authenticated access is unavailable in this session, so the private runtime gate cannot be verified or changed safely. This is not an Apple credential blocker: the candidate is designed to run in Expo Go through the included HTTPS WebView path."
NEXT_ACTION: "In the Render service ping-backend-staging, verify the staging runtime gate required by the deployed client route is active (M8_LIVE_VOICE_ENABLED=true with PING_ENVIRONMENT=staging), save/redeploy only staging, then confirm the client route returns 200 before the iPhone Expo Go test."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral contract/offline invariants implemented; user-to-Ping realtime_webrtc_core_bridge candidate deployed to staging; Expo Go path is technically available in the candidate but the staging live-voice gate is not yet observable; provider winner remains unselected"
M8_SPIKE_EVIDENCE: "Run 36473614241; quality/deploy/health/authenticated E2E PASS for eb82cefb31466f5d1f3d15e349451c012cf62c70; /api/health reported ok/db connected/commit eb82cef/deployment_marker ping-backend-staging; public /api/agent/voice/live/client probe returned HTTP 404; no Apple build or physical voice result claimed."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "The deployed staging client route returns HTTP 404, indicating the private staging live-voice gate is not observably active. Render authenticated access is unavailable in this session; changing the runtime gate without that access would be unsafe."
EVIDENCE: "Run 36473614241 passed quality, exact staging deploy/health and authenticated E2E for eb82cef; /api/health returned ok=true, db_status=connected, commit=eb82cef, deployment_marker=ping-backend-staging at 2026-09-28T20:09:03Z. GET /api/agent/voice/live/client returned HTTP 404 at 2026-09-28T20:09:04Z. The code gate requires PING_ENVIRONMENT=staging and M8_LIVE_VOICE_ENABLED=true."
OPTIONS: "In Render, open ping-backend-staging → Environment and verify M8_LIVE_VOICE_ENABLED=true and PING_ENVIRONMENT=staging, save/redeploy only that service, then provide the resulting healthy deployment for route verification. No Apple credential action is requested at this stage."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Verify the two private staging gate values in ping-backend-staging and redeploy only staging; once the client route returns 200, run the single short Expo Go measurement."
```
