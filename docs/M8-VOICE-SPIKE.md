# Ping M8 — Technical Voice Spike

Status: `SPIKE_READY_FOR_MEASURED_PROVIDER_COMPARISON`

The product/architecture gate accepted the following direction: M8 must reach
natural, bidirectional, real-time and interruptible voice over the existing
Ping Core. Push-to-talk remains a fallback or diagnostic path; it is not the
M8 completion criterion.

## Current implementation baseline

The implementation available before this spike is a chained batch flow:

`record on iPhone -> upload audio -> backend transcription -> visible transcript review -> /agent/turn -> visual response`

It does not yet provide a live session, spoken assistant output, partial
transcripts, native interruption/barge-in, or audio turn cancellation. The
existing Core boundary already accepts the canonical agent turn and preserves
identity, conversation, authorization, confirmation and provenance. The
existing `speechRef` field and speech synthesis abstraction are not a live
provider implementation.

## Spike boundary

The new provider-neutral contract in
`backend/src/types/m8Voice.ts` and the pure measurement service in
`backend/src/services/m8VoiceSpike.service.ts` model a candidate voice
transport without modifying the product runtime. They verify:

- one actor, conversation and voice-session identity across turns;
- Core disposition before any possible action;
- confirmation required for action-bearing turns;
- barge-in stops assistant audio before listening resumes;
- fallback is an explicit session state;
- writers, persistence and tools remain zero during the spike;
- provider candidates are not selected before real measurements exist.

The contract is deliberately provider-neutral. It is not a second agent and
does not grant audio receipt permission to execute a domain action.

## Candidates to measure

| Candidate | Media | Interruption | Core boundary | Current status |
|---|---|---|---|---|
| `gpt_live_webrtc` | full duplex | provider/native | backend delegation to existing Core | pending real probe |
| `realtime_webrtc_sideband` | full duplex | provider/native plus server control | sideband/backend bridge | pending real probe |
| `gpt_live_websocket` | full duplex, server-owned media | provider/native | backend bridge | pending real probe |
| `chained_batch` | turn-based | application-only | existing transcription + `/agent/turn` | baseline only |

No candidate is declared the winner by documentation or by an enum. The
decision must use measured p50/p95 session setup, first useful audio,
interruption response, Core turn time, transcription quality, fallback rate,
resilience, privacy exposure, and cost. Results must identify whether each
measurement is real provider data, a local synthetic check, or unavailable.

## Safety contract for a live adapter

The eventual adapter must:

1. authenticate the user before opening a Core-bound session;
2. carry the existing actor, conversation and voice-session identity;
3. send transcript turns through the same Core boundary as text;
4. treat audio and model output as proposals/input, never as authorization;
5. preserve the current confirmation and authorization gates;
6. cancel/truncate interrupted assistant audio without executing a stale plan;
7. fall back to visible text or batch voice message without losing provenance;
8. expose only sanitized session and latency telemetry;
9. retain audio/transcripts only under an explicit approved policy;
10. keep production disabled until staging evidence and physical iPhone tests pass.

## Measurement protocol

For each candidate, run the same non-destructive scenarios in staging or an
isolated local harness:

1. open a user-initiated session;
2. speak a read-only question and measure first useful audio;
3. ask a contextual follow-up and verify the same Core identity/context;
4. interrupt while Ping is speaking and measure stop-to-listening latency;
5. issue a correction and verify the Core's canonical disposition;
6. propose an action and verify confirmation is still required;
7. force provider/network failure and verify text or batch fallback;
8. close the session and verify no unintended writer, persistence or tool activity.

Required evidence per run:

- provider/model and session mode, without secrets;
- p50/p95 setup, first transcript, Core response and first-audio latency;
- barge-in response distribution;
- transcript/response quality adjudication;
- fallback and reconnect counts;
- cost or usage exposed by the provider;
- privacy/retention behavior;
- Core disposition, authorization and side-effect counters.

## Real-provider status

No provider has been selected yet. The repository currently has no live voice
transport implementation and the isolated worktree has no copied credentials.
The next provider probe must be run only through an approved staging/local
environment, with a short-lived or existing authorized session, and must not
write secrets to this repository.

## Reference material

The current provider-neutral comparison was informed by the official OpenAI
voice guidance, which distinguishes full-duplex live sessions, realtime
sideband/server control and chained pipelines:

- https://developers.openai.com/api/docs/guides/voice-agents
- https://developers.openai.com/api/docs/guides/voice-webrtc
- https://developers.openai.com/api/docs/guides/live-delegation
- https://developers.openai.com/api/docs/guides/voice-server-controls
- https://developers.openai.com/api/docs/guides/voice-latency-cost

These references do not constitute a provider decision or product acceptance.

