# Ping M8 — Architecture and Product Proposal

```yaml
MILESTONE: M8
STATUS: GATE_ACCEPTED_SPIKE_IN_PROGRESS
PREVIOUS_MILESTONE: "M7 accepted and complete"
IMPLEMENTATION_STARTED: SPIKE_ONLY_NO_RUNTIME_PROVIDER
NORTH_STAR_ALIGNMENT: "Natural horizontal assistance over one Ping Core, with context, references, corrections, useful memory, controlled initiative and safe actions."
```

## Objective

Give the existing iPhone app a genuine spoken-conversation interface: the user
speaks naturally, Ping answers with audio, and subsequent turns preserve the
same authorized context, references, corrections, confirmations and safety
rules already owned by Ping Core.

This is a new interface over Ping, not a second agent. Text, voice message and
live voice must coexist and converge on the same Core, identity, conversation
state and authorization model.

## Proposed scope

- A user-initiated live voice session on iPhone, with explicit start/stop.
- Speech input and spoken Ping responses with visible transcript/status.
- Reuse of the existing conversation identity and Core turn lifecycle.
- Natural multi-turn follow-ups, corrections, interruptions and clarification.
- Confirmation-bound actions; no writer runs merely because speech was heard.
- Sanitized traceability for session, latency, transcription, Core disposition
  and execution result.
- Graceful fallback to text or voice message when live voice is unavailable.

## Explicit non-goals for M8

- Tablet/device mode or ambient operation.
- Wake word, always-on microphone or background listening.
- A second agent, model, memory store or authorization system.
- Production rollout, destructive migrations or removal of Legacy.
- Replacing the existing messaging and commitment experience.

## Decisions required at the gate

The gate accepted the objective and boundaries. The technical choices remain
open until the measured spike in `docs/M8-VOICE-SPIKE.md` provides evidence for
transport, speech architecture, interruption, privacy, cost and rollout.

## Proposed exit evidence

- Real iPhone conversation with spoken Ping replies, not only transcription
  followed by a visual text response.
- At least one multi-turn reference and one correction preserved by the same
  Core used by text.
- Confirmation, rejection and cancellation remain bound to the current plan
  and authorized identity.
- No unauthorized writer, persistence or tool side effect in safety tests.
- Text, voice message and live voice produce consistent Core dispositions.
- Measured latency, interruption behavior, provider failure and fallback are
  documented before any broader rollout.

## Sequence after approval

1. Approve or revise this product/architecture boundary.
2. Produce a small technical spike and contract tests without changing the
   production path.
3. Implement behind a staging-only feature boundary.
4. Certify on iPhone, then decide whether a later device milestone is ready.

The product/architecture gate is accepted. M8 remains in spike mode until a
provider is selected from measured evidence and a staging-only implementation
passes the safety and real-iPhone criteria above.
