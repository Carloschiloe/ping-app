# Ping - prioritized autonomous task queue

The queue is ordered by risk and dependency. Completed items require linked
evidence; a green unit test alone does not close a milestone.

| Priority | Type | Task | State | Evidence / exit condition |
|---|---|---|---|---|
| P0 | SECURITY / INFRASTRUCTURE | Create the staging-only Render deploy hook and store it in `ping-staging-certification` | DONE | Environment secret present; staging-only hook used by the certification circuit; production untouched |
| P1 | CERTIFICATION | Run the permanent staging gate for the current M7 candidate | DONE | Quality, exact health/SHA, authenticated semantic `/agent/turn` E2E and artifact evidence recorded in the M7 completion candidate |
| P1 | CERTIFICATION | Verify M7 health, auth, persistence, reload, conversation and safety invariants in staging | DONE | Strong semantic sequence PASS; private database diagnostic PASS; zero writers/mutations/messages in the certification artifact |
| P1 | SECURITY | Verify `PING_M7_PRIVATE_DB_CHECK=PASS` in Render staging startup logs | DONE | Owner-confirmed exact non-secret diagnostic line; no secret copied or recorded |
| P1 | BUG | Correct the real staging objective-switch/return defect structurally and recertify only staging | DONE | Structural correction and staging certification recorded in M7 state |
| P2 | QUALITY / TECHNICAL_DEBT | Separate or repair pre-existing full-suite environment failures without weakening the staging gate | DEFERRED | Baseline comparison and reproducible CI result |
| P2 | QUALITY | Strengthen the staging smoke semantic assertions for objective switch, return, correction, slot isolation, confirmation binding and ambiguity | DONE | Strong assertions run in the staging certification circuit |
| P3 | PRODUCT / ARCHITECTURE | Correct and certify the M8 Expo Go entry path plus social conversation semantics | IN_PROGRESS | Physical failure recorded on 37380ca: social utterance incorrectly clarified and live client route returned HTTP 404. Local correction passes 518 focused tests and TypeScript; staging verification remains required |
| P4 | QUALITY / CERTIFICATION | Certify the selected live voice adapter on staging and iPhone | BLOCKED_BY_P3 | Requires exact staging SHA/health, `/api/agent/voice/live/client` returning the voice client, then physical user-to-Ping spoken output, continuity, interruption and zero-side-effect evidence |

## Queue rules

- A task is not complete because an implementation exists; it needs evidence.
- A failure is first classified as PRODUCT, SEMANTIC/MODEL, CORE/STATE,
  PERSISTENCE, AUTHORIZATION, SECURITY, HARNESS, FIXTURE, INFRASTRUCTURE,
  NONDETERMINISM or REGRESSION.
- The next task is selected from this queue after each verified result.
