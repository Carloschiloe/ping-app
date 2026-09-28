# Ping — prioritized autonomous task queue

The queue is ordered by risk and dependency. Completed items require linked
evidence; a green unit test alone does not close a milestone.

| Priority | Type | Task | State | Evidence / exit condition |
|---|---|---|---|---|
| P0 | SECURITY / INFRASTRUCTURE | Create the staging-only Render deploy hook and store it in `ping-staging-certification` | DONE | Environment secret present; run 36442340938 requested the hook successfully; production untouched |
| P1 | CERTIFICATION | Run the permanent staging gate for the current M7 candidate | DONE | Run 36442340938: quality PASS, exact health/SHA PASS, authenticated `/agent/turn` E2E PASS, artifact 10979297488 |
| P1 | CERTIFICATION | Verify M7 health, auth, persistence, reload, conversation and safety invariants in staging | PARTIAL_PASS | Health/auth/re-auth/reload/checkpoint/tombstone/safety PASS on 08ada94; private startup diagnostic still needs Render-log evidence and semantic assertions remain limited to the smoke contract |
| P1 | SECURITY | Verify `PING_M7_PRIVATE_DB_CHECK=PASS` in Render staging startup logs | HUMAN_GATE_REQUIRED | Required exact non-secret log line; Render log/API access is not available to this agent |
| P1 | BUG | If staging E2E exposes a real M7 defect, reproduce, fix structurally, regress, and publish only staging | NOT_TRIGGERED | Current authenticated E2E exposed harness defects only; no product defect evidenced |
| P2 | QUALITY / TECHNICAL_DEBT | Separate or repair pre-existing full-suite environment failures without weakening the staging gate | DEFERRED | Baseline comparison and reproducible CI result |
| P2 | QUALITY | Strengthen the staging smoke's semantic assertions for objective switch, return, correction, slot isolation, confirmation binding and ambiguity | PENDING | Assertions must be added without phrase/case patches, then pass on an exact staging SHA |
| P3 | PRODUCT / ARCHITECTURE | Propose M8 only after M7 completion candidate is externally reviewed | BLOCKED | M7 completion candidate accepted; scope gate required |

## Queue rules

- A task is not complete because an implementation exists; it needs evidence.
- A failure is first classified as PRODUCT, SEMANTIC/MODEL, CORE/STATE,
  PERSISTENCE, AUTHORIZATION, SECURITY, HARNESS, FIXTURE, INFRASTRUCTURE,
  NONDETERMINISM or REGRESSION.
- The next task is selected from this queue after each verified result.
