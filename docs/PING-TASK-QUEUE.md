# Ping — prioritized autonomous task queue

The queue is ordered by risk and dependency. Completed items require linked
evidence; a green unit test alone does not close a milestone.

| Priority | Type | Task | State | Evidence / exit condition |
|---|---|---|---|---|
| P0 | SECURITY / INFRASTRUCTURE | Create protected GitHub environment `ping-staging-certification`, staging-only Render deploy hook, and staging Supabase E2E secrets | HUMAN_GATE_REQUIRED | Owner configures values without exposing them; workflow can read them only in the deploy job |
| P1 | CERTIFICATION | Run the permanent staging gate for the current M7 candidate | BLOCKED_BY_P0 | Quality PASS, exact health SHA, authenticated `/agent/turn`, sanitized artifact |
| P1 | CERTIFICATION | Verify M7 health, auth, persistence, reload, conversation and safety invariants in staging | PENDING | Evidence from the exact deployed SHA; no production writes |
| P1 | BUG | If staging E2E exposes a real M7 defect, reproduce, fix structurally, regress, and publish only staging | READY_AFTER_P1 | Root cause plus holdout regression; no phrase/keyword/case patch |
| P2 | QUALITY / TECHNICAL_DEBT | Separate or repair pre-existing full-suite environment failures without weakening the staging gate | DEFERRED | Baseline comparison and reproducible CI result |
| P2 | SECURITY | Complete private staging DB check and record only non-secret status | PENDING | `PING_M7_PRIVATE_DB_CHECK=PASS` from authorized staging evidence |
| P3 | PRODUCT / ARCHITECTURE | Propose M8 only after M7 completion candidate is externally reviewed | BLOCKED | M7 completion candidate accepted; scope gate required |

## Queue rules

- A task is not complete because an implementation exists; it needs evidence.
- A failure is first classified as PRODUCT, SEMANTIC/MODEL, CORE/STATE,
  PERSISTENCE, AUTHORIZATION, SECURITY, HARNESS, FIXTURE, INFRASTRUCTURE,
  NONDETERMINISM or REGRESSION.
- The next task is selected from this queue after each verified result.

