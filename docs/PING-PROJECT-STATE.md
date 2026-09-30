# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_ANDROID_DEVELOPMENT_RUNTIME_READY
ACTIVE_TASK: "Use the verified SDK57 Android development build/emulator for M8; iPhone SDK57 remains a future Apple/EAS gate."
LAST_CERTIFIED_SHA: "7f67f4df699112552a9055fd40f15fd0d2c6f2a7 (workflow 36572178706: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: 7f67f4df699112552a9055fd40f15fd0d2c6f2a7
STAGING_DEPLOYED_SHA: "7f67f4df699112552a9055fd40f15fd0d2c6f2a7 (workflow 36572178706; /api/health ok/db connected/commit 7f67f4d/deployment_marker ping-backend-staging; voice client route HTTP 200)"
KNOWN_FAILURES: "Expo Go App Store runtime is SDK54 while the current mobile project is SDK57/RN0.86.3; Expo Go is not a valid runtime. Android SDK57 development build/emulator is prepared locally. Product voice behavior, continuity and barge-in are not certified until tested in the Android runtime. iPhone SDK57 remains an Apple/EAS gate."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution; focused M7/M8 tests and build pass. Legacy remains."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E. SDK57 iPhone testing uses a development client, not Expo Go."
BLOCKERS: "An Apple/EAS signing, 2FA, device registration or installation prompt may require owner interaction. Physical evidence is still required for spoken response, continuity and barge-in."
NEXT_ACTION: "Run the M8 physical voice conversation trial in the verified Android development build, capturing spoken input, spoken output, continuity and barge-in."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; Expo Go is excluded because its iPhone runtime stops at SDK54 while Ping is SDK57. Android SDK57 development build/emulator is now the primary local M8 runtime; provider winner remains unselected; M8 is incomplete"
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
