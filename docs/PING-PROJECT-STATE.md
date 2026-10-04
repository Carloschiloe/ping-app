# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_CANONICAL_RUNTIME_REFACTOR_IN_PROGRESS
ACTIVE_TASK: "Unify staging text and mobile voice on the durable Ping conversation runtime before another physical test."
LAST_CERTIFIED_SHA: "dcb783e5553ada37131229add71d5594eb53f3d6 (workflow 37173343025: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: dcb783e5553ada37131229add71d5594eb53f3d6
STAGING_DEPLOYED_SHA: "dcb783e5553ada37131229add71d5594eb53f3d6 (workflow 37173343025; /api/health ok/db connected/commit dcb783e/deployment_marker ping-backend-staging)"
KNOWN_FAILURES: "The recovered Redmi physical session showed voice losing durable context between correction and confirmation because the voice adapter duplicated business orchestration and staging durable runtime was not the default. No new physical test is authorized until this candidate is tested and staged. Expo Go remains invalid for SDK57; Android development build is the primary physical runtime."
TECHNICAL_DEBT: "Legacy text authorization UI contracts remain for compatibility, but the staging path now moves confirmation/authorization/execution into the shared server runtime. Full repository tests still require the local backend environment; focused runtime/voice/continuity tests pass."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One durable conversation runtime serves text and mobile_voice. Voice is transport/presentation only. Staging requires quality, exact SHA health, then authenticated E2E. SDK57 iPhone testing uses a development client, not Expo Go."
BLOCKERS: "An Apple/EAS signing, 2FA, device registration or installation prompt may require owner interaction. Physical evidence is still required for spoken response, continuity and barge-in."
NEXT_ACTION: "Run backend full focused regression, CI and staging certification for the canonical runtime candidate; do not request a physical retest before staging evidence."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; Expo Go is excluded because its iPhone runtime stops at SDK54 while Ping is SDK57. Android SDK57 development build is the primary physical runtime; canonical conversation runtime refactor is in progress; provider winner remains unselected; M8 is incomplete"
M8_SPIKE_EVIDENCE: "Runtime audit: project SDK57/RN0.86.3, Expo Go App Store iPhone runtime SDK54, compatibility FAIL. Android evidence: Ping_M8_API35 booted, com.carloschiloe.ping.staging installed, Metro offline development-client manifest HTTP 200, adb reverse active, MainActivity resumed, Running main observed, staging health ok/db connected, RECORD_AUDIO/MODIFY_AUDIO_SETTINGS granted and emulator audio output available. No physical M8 PASS claimed. EAS project @carloschiloe/mobile remains the future iPhone gate."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: NO
REASON: "Android development runtime is available locally. Apple/EAS signing remains a future iPhone gate and is not required for the current M8 Android runtime."
EVIDENCE: "Android toolchain, API35 AVD, development APK, Metro and staging health were verified locally."
OPTIONS: "Continue M8 validation in Android development runtime; keep iPhone SDK57 as a future Apple/EAS gate."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Perform the M8 user-to-Ping voice trial in the Android development build."
```
