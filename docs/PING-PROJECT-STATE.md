# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_CANONICAL_RUNTIME_REFACTOR_IN_PROGRESS
ACTIVE_TASK: "Preserve the single durable conversation runtime boundary and prepare the next physical M8 voice validation only after recoverable telemetry is available."
LAST_CERTIFIED_SHA: "0c52ab93b5bdb9621b5f86a7c88bbaea5cd681f0 (workflow 37216999644: quality PASS, exact staging deploy/health PASS, authenticated E2E PASS, cleanup PASS)"
STAGING_REMOTE_SHA: 0c52ab93b5bdb9621b5f86a7c88bbaea5cd681f0
STAGING_DEPLOYED_SHA: "0c52ab93b5bdb9621b5f86a7c88bbaea5cd681f0 (workflow 37216999644; exact SHA health PASS, authenticated E2E PASS; artifact run 51ccf186-d44a-47f0-8543-50febcc57059)"
KNOWN_FAILURES: "The prior physical Redmi trace is not recoverable because the process-local latest-telemetry buffer has no retained artifact. The durable runtime objective-switch/stale-slot defect is fixed and the authenticated staging E2E now passes through correction, rejection, confirmation, verified execution, read-after-write and fixture cleanup. No new physical test is authorized until a recoverable telemetry path is demonstrated. Expo Go remains invalid for SDK57; Android development build is the primary physical runtime."
TECHNICAL_DEBT: "Legacy text PlanCard authorization contracts remain for compatibility, while the staging durable path moves semantic confirmation, authorization, execution and verification into the shared server runtime. The architecture audit is recorded in docs/PING-CONVERSATION-RUNTIME-ARCHITECTURE.md."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One durable conversation runtime serves text and mobile_voice. Voice is transport/presentation only. Staging requires quality, exact SHA health, then authenticated E2E. SDK57 iPhone testing uses a development client, not Expo Go."
BLOCKERS: "An Apple/EAS signing, 2FA, device registration or installation prompt may require owner interaction. Physical evidence is still required for spoken response, continuity and barge-in."
NEXT_ACTION: "Keep the current staging SHA stable and close the remaining observability gap for recoverable physical voice evidence before requesting one physical M8 retest."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; Expo Go is excluded because its iPhone runtime stops at SDK54 while Ping is SDK57. Android SDK57 development build is the primary physical runtime; the shared durable conversation runtime is staging-certified; recoverable physical voice evidence remains required; provider winner remains unselected; M8 is incomplete"
M8_SPIKE_EVIDENCE: "Runtime audit: project SDK57/RN0.86.3, Expo Go App Store iPhone runtime SDK54, compatibility FAIL. Android evidence: Ping_M8_API35 booted, com.carloschiloe.ping.staging installed, Metro offline development-client manifest HTTP 200, adb reverse active, MainActivity resumed, Running main observed, staging health ok/db connected, RECORD_AUDIO/MODIFY_AUDIO_SETTINGS granted and emulator audio output available. No physical M8 PASS claimed. EAS project @carloschiloe/mobile remains the future iPhone gate."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: NO
REASON: "Android development runtime is available locally. Apple/EAS signing remains a future iPhone gate and is not required for the current M8 Android runtime."
EVIDENCE: "Android toolchain, API35 AVD, development APK, Metro and staging health were verified locally."
OPTIONS: "Continue M8 validation in Android development runtime; keep iPhone SDK57 as a future Apple/EAS gate."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Make the latest physical voice trace recoverable without relying on a process-local buffer, then perform one controlled M8 physical validation."
```
