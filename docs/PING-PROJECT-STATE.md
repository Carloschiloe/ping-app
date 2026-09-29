# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_EXPO_GO_PHYSICAL_TEST_FAILED_CORRECTION_READY_FOR_STAGING
ACTIVE_TASK: "Publish and certify the structural social-conversation and live-voice bootstrap corrections on staging, then repeat the short Expo Go iPhone test."
LAST_CERTIFIED_SHA: "37380ca4a82b4f084de92c0fd4920fcf00254089 (staging health previously verified; current correction is local and not yet certified)"
STAGING_REMOTE_SHA: 37380ca4a82b4f084de92c0fd4920fcf00254089
STAGING_DEPLOYED_SHA: "37380ca4a82b4f084de92c0fd4920fcf00254089; /api/health ok/db connected/commit 37380ca/deployment_marker ping-backend-staging; physical test exposed two failures: social utterance was routed to clarification and GET /api/agent/voice/live/client returned HTTP 404 Not found"
KNOWN_FAILURES: "Physical iPhone/Expo Go test failed. Root cause 1: the legacy Core lacked an explicit semantic interaction mode, so a non-task conversational utterance fell through the no-evidence/topic-too-broad clarification path. Root cause 2: the credential-free static WebView bootstrap was coupled to the authenticated provider/session feature flag and returned a misleading 404 before the WebView could start. Local structural corrections pass focused tests and TypeScript but are not staging-certified yet."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution; focused M7/M8 tests and build pass. Legacy remains."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "Staging certification is pending. The static client route correction must not weaken the authenticated M8_LIVE_VOICE_ENABLED session gate."
NEXT_ACTION: "Run focused regressions, publish only codex/staging-beta through the staging gate, verify exact health/SHA and the live client route, then repeat the short Expo Go test. Do not claim M8 PASS until spoken response, continuity and barge-in are physically observed."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; physical Expo Go test failed before voice conversation. Local correction adds semantic conversation handling and decouples the credential-free static bootstrap from the authenticated session gate; provider winner remains unselected"
M8_SPIKE_EVIDENCE: "Physical iPhone evidence: 'Hola como estas?' incorrectly produced clarification; entering Ping Voz produced literal 'Not found'. Local exact-origin probe against https://ping-backend-staging.onrender.com/api/agent/voice/live/client returned HTTP 404 on 37380ca. Focused regressions: 518/518 PASS; TypeScript build PASS. No staging certification or M8 functional PASS claimed for the local correction."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: NO
REASON: "The physical failure is being corrected locally within the authorized staging loop. No Apple credential action is requested."
EVIDENCE: "Physical test failure is recorded above. The local correction has 518 focused tests passing and a successful TypeScript build; staging verification is intentionally still pending."
OPTIONS: "None currently. Publish only through the staging quality/deploy gate and verify the exact deployed SHA before asking for another physical test."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Publish the isolated correction to codex/staging-beta, verify staging health/SHA and the exact WebView client route, then provide one short iPhone test."
```
