# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_PHYSICAL_RETEST_BLOCKED_BY_TWO_REPRODUCED_FAILURES
ACTIVE_TASK: "Diagnose and certify the explicit-person resolution path and the live-voice WebView session lifecycle before requesting another iPhone test."
LAST_CERTIFIED_SHA: "d65fe6afcf9432c824e66bedb2492d63379efc62 (workflow 36564447428: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: d65fe6afcf9432c824e66bedb2492d63379efc62
STAGING_DEPLOYED_SHA: "d65fe6afcf9432c824e66bedb2492d63379efc62 (workflow 36564447428; /api/health ok/db connected/commit d65fe6a/deployment_marker ping-backend-staging; GET /api/agent/voice/live/client HTTP 200, 11214 bytes, stage telemetry markers present, no Not found)"
KNOWN_FAILURES: "Second physical test: social greeting PASS; explicit write 'Agenda mañana a las 14 ir a visitar a Edgardo Borquez' incorrectly claimed there was no name; Ping Voz opened but stayed indefinitely at 'Conectando con Ping...' with no listening, response or barge-in. The candidate correction is local only and staging has not yet been updated."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution; focused M7/M8 tests and build pass. Legacy remains."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E."
BLOCKERS: "Before another physical test, staging must contain the structural person-scope/unknown-name correction and the voice lifecycle instrumentation/timeout/config-bootstrap correction. Physical evidence is still required for spoken response, continuity and barge-in."
NEXT_ACTION: "Run focused regressions and TypeScript, publish only through the staging quality/deploy gate, verify exact SHA/health and voice-client route, then request one short physical test."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; physical Expo Go test failed before voice conversation. Local correction adds semantic conversation handling and decouples the credential-free static bootstrap from the authenticated session gate; provider winner remains unselected"
M8_SPIKE_EVIDENCE: "The second physical run confirms greeting PASS but reproduces two product failures: explicit named write entered the unresolved-person wording, and the WebView remained at 'Conectando con Ping...'. Candidate d65fe6a is staging-certified by workflow 36564447428: backend build/focused quality PASS, exact SHA/health PASS, authenticated staging E2E PASS, and public voice client route HTTP 200 with 11214-byte HTML containing sanitized lifecycle markers and no Not found. The candidate adds grounded semantic person resolution for write turns, truthful person-not-found clarification, WebView config reinjection, bounded setup timeouts and sanitized stage telemetry. Backend focused tests 359/359 and backend/mobile TypeScript PASS locally. No physical M8 PASS claimed."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: NO
REASON: "The physical failure is being corrected locally within the authorized staging loop. No Apple credential action is requested."
EVIDENCE: "The second physical failure is recorded above. The local correction has 359 focused backend tests, backend build and mobile TypeScript passing; staging verification is intentionally still pending."
OPTIONS: "None currently. Publish only through the staging quality/deploy gate and verify the exact deployed SHA before asking for another physical test."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Commit the isolated correction, publish only through codex/staging-beta's staging gate, verify exact SHA/health and inspect sanitized voice stage telemetry after the next physical attempt."
```
