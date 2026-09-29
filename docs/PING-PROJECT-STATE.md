# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_EXPO_GO_READY_FOR_PHYSICAL_RETEST
ACTIVE_TASK: "Run the short Expo Go iPhone retest of social conversation and user-to-Ping live voice, including continuity and barge-in."
LAST_CERTIFIED_SHA: "7529882e1998ebacbc05e03d7f965bdd41628ec6 (workflow 36511880309: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: 7529882e1998ebacbc05e03d7f965bdd41628ec6
STAGING_DEPLOYED_SHA: "7529882e1998ebacbc05e03d7f965bdd41628ec6 (workflow 36511880309; /api/health ok/db connected/commit 7529882/deployment_marker ping-backend-staging; GET /api/agent/voice/live/client HTTP 200, 7514 bytes, WebRTC/Core markers present)"
KNOWN_FAILURES: "The previous physical test failed because a social utterance was routed to clarification and the voice WebView bootstrap returned 404. Both code paths are corrected and staging-certified at the route/E2E gate. The physical retest is still required; M8 is not declared complete."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution; focused M7/M8 tests and build pass. Legacy remains."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "Physical iPhone evidence is still required for spoken response, continuity and barge-in. The authenticated live-voice session broker remains protected by the staging feature gate."
NEXT_ACTION: "Repeat the short Expo Go test against the running staging backend and record whether social conversation, spoken response, continuity and barge-in work. Do not claim M8 PASS from route or automated E2E alone."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; physical Expo Go test failed before voice conversation. Local correction adds semantic conversation handling and decouples the credential-free static bootstrap from the authenticated session gate; provider winner remains unselected"
M8_SPIKE_EVIDENCE: "Physical failure was reproduced on the prior build. Correction commit ebe4e2d passed 518 focused tests and TypeScript; workflow 36511436977 passed quality, exact staging health/SHA and authenticated staging E2E. Documentation state commit 7529882 was then deployed and workflow 36511880309 passed the same gates. Exact staging route probe now returns HTTP 200 with RTCPeerConnection, getUserMedia, /agent/turn and response.cancel markers and no Not found body. No physical M8 PASS claimed."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: NO
REASON: "The physical failure is being corrected locally within the authorized staging loop. No Apple credential action is requested."
EVIDENCE: "Physical test failure is recorded above. The local correction has 518 focused tests passing and a successful TypeScript build; staging verification is intentionally still pending."
OPTIONS: "None currently. Publish only through the staging quality/deploy gate and verify the exact deployed SHA before asking for another physical test."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Publish the isolated correction to codex/staging-beta, verify staging health/SHA and the exact WebView client route, then provide one short iPhone test."
```
