# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M7
CURRENT_STATE: M7_SEMANTIC_DIALOGUE_RECONCILIATION_BLOCKED
ACTIVE_TASK: "Publish and recertify the structural semantic dialogue-act and suspended-objective reconciliation fix before any M8 work."
LAST_CERTIFIED_SHA: "7bf5b477205fbcbc5298879695fe50fa9342bd21 (workflow 37235776200: quality PASS, exact staging deploy/health PASS, authenticated E2E PASS; the separate Jarvis certification run 37236059358 is not a passing certification)"
STAGING_REMOTE_SHA: 7bf5b477205fbcbc5298879695fe50fa9342bd21
STAGING_DEPLOYED_SHA: "7bf5b477205fbcbc5298879695fe50fa9342bd21 (workflow 37235776200; exact SHA health PASS, authenticated E2E PASS; artifact run 75eb5d80-2634-4670-9847-df9f46df847b)"
KNOWN_FAILURES: "Jarvis certification run 37236059358 executed 100 cases/480 calls and passed 49/100. The remaining failures are concentrated in correction-twice, clarification-confirmation, objective-switch, contextual-follow-up and reconnect scenarios; create-reject had one external HTTP 502. The artifact reports 30 real writes followed by complete cleanup, with no orphaned identities. A structural dialogueAct/suspend_current reconciliation fix is prepared locally but is not yet published or certified. M8 remains paused."
TECHNICAL_DEBT: "Legacy text PlanCard authorization contracts remain for compatibility, while the staging durable path moves semantic confirmation, authorization, execution and verification into the shared server runtime. The architecture audit is recorded in docs/PING-CONVERSATION-RUNTIME-ARCHITECTURE.md."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One durable conversation runtime serves text and mobile_voice. Voice is transport/presentation only. Staging requires quality, exact SHA health, then authenticated E2E. SDK57 iPhone testing uses a development client, not Expo Go."
BLOCKERS: "The next M7 candidate cannot be committed/pushed from this session because the approval system rejected the commit operation after its automatic-approval usage limit was reached. The current Jarvis semantic failures must be recertified on the published structural fix before M7 can close."
NEXT_ACTION: "Commit/publish the already-tested semantic dialogue reconciliation changes, then run the frozen Jarvis certification once on that exact SHA and update this state from its artifact."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: NO
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
