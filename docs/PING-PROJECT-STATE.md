# Ping - project state

This is the canonical current-state record for autonomous development. It is
not a conversation log. Update values only after reproducible evidence.

```yaml
PROJECT_NORTH_STAR: "Ping is one safe, natural, horizontal assistant over a shared Ping Core: text, voice, memory, context, initiative and tools."
CURRENT_MILESTONE: M8
CURRENT_STATE: M8_IPHONE_DEVELOPMENT_BUILD_REQUIRED
ACTIVE_TASK: "Generate and install the SDK57 staging iOS development build; Expo Go is not a valid runtime for the current mobile project."
LAST_CERTIFIED_SHA: "7f67f4df699112552a9055fd40f15fd0d2c6f2a7 (workflow 36572178706: quality PASS, exact staging deploy/health PASS, authenticated staging E2E PASS)"
STAGING_REMOTE_SHA: 7f67f4df699112552a9055fd40f15fd0d2c6f2a7
STAGING_DEPLOYED_SHA: "7f67f4df699112552a9055fd40f15fd0d2c6f2a7 (workflow 36572178706; /api/health ok/db connected/commit 7f67f4d/deployment_marker ping-backend-staging; voice client route HTTP 200)"
KNOWN_FAILURES: "Expo Go App Store runtime is SDK54 while the current mobile project is SDK57/RN0.86.3; physical M8 cannot be validly tested with Expo Go. The SDK57 dev-client profile is configured locally; EAS iOS signing/build/install remains pending. Product voice behavior is not certified until tested in that runtime."
TECHNICAL_DEBT: "The full repository test command still has pre-existing local environment failures before test execution; focused M7/M8 tests and build pass. Legacy remains."
SECURITY_DEBT: "Staging-only GitHub/Render controls remain in use; production secrets and data are not used. The authenticated live-voice session broker retains its staging feature gate."
ARCHITECTURAL_DECISIONS: "LLM proposes; Ping Core validates and decides. One Core serves all surfaces. Staging requires quality, exact SHA health, then authenticated E2E. SDK57 iPhone testing uses a development client, not Expo Go."
BLOCKERS: "An Apple/EAS signing, 2FA, device registration or installation prompt may require owner interaction. Physical evidence is still required for spoken response, continuity and barge-in."
NEXT_ACTION: "Run mobile gates, commit the SDK57 dev-client configuration, publish only to codex/staging-beta, then start the EAS staging-ios-dev build."
PRODUCTION_STATE: "main remote 6825339d062b1233e4d2958c4e80d516d38d375d; production untouched; no production secrets or data used."
M7_COMPLETE: YES
M8_SPIKE_STATUS: "provider-neutral user-to-Ping realtime_webrtc_core_bridge remains the target; Expo Go is excluded because its iPhone runtime stops at SDK54 while Ping is SDK57. The SDK57 development-client path is prepared; provider winner remains unselected"
M8_SPIKE_EVIDENCE: "Runtime audit: project SDK57/RN0.86.3, Expo Go App Store iPhone runtime SDK54, compatibility FAIL. Previous apparent Expo Go success was on the pre-SDK57 state (parent of d3539a1, Expo54/RN0.81.5). EAS project @carloschiloe/mobile and project ID 0baf032d-de1a-49e7-9181-a5897927fb11 are authenticated; expo-dev-client ~57.0.19 and staging-ios-dev are configured locally. No physical M8 PASS claimed."
```

## Current human gate

```yaml
HUMAN_GATE_REQUIRED: YES
REASON: "EAS iOS signing/distribution or device installation may require the owner to complete Apple authentication, 2FA, or device registration."
EVIDENCE: "SDK57 incompatibility with Expo Go is demonstrated; EAS account/project access works, expo-dev-client and staging-ios-dev are configured locally. The remaining gate is only the Apple/EAS interaction required if existing signing credentials are insufficient."
OPTIONS: "Complete the EAS/Apple prompt in the terminal if it appears; do not provide credentials in chat."
RECOMMENDED_NEXT_TECHNICAL_ACTION: "Run the authorized EAS build for profile staging-ios-dev and stop only at an unavoidable Apple/EAS prompt."
```
