# Production smoke and observability plan

This is a plan only; it has not been executed against production.

## Smoke order

1. `/api/health` and sanitized startup configuration marker.
2. Auth session creation and expiry behavior.
3. Two authenticated users: own-data reads succeed; cross-user reads and
   writes are denied.
4. Self-chat/message send and read-after-write.
5. Commitment proposal, explicit confirmation, canonical write, and
   read-after-write. A proposal alone must not write.
6. Duplicate/replay request is idempotent.
7. Realtime subscription and Storage metadata/access checks.
8. Semantic request with provider attribution enabled only as sanitized
   metadata: requested model, actual model, fallback boolean, status and
   latency. Never log tokens, headers, prompts, audio, SDP, or private content.

## Required evidence

Each check records only pass/fail, correlation ID, status class, latency and
sanitized error class. Production is not considered ready if any step is
`UNKNOWN`.
