# Ping — prioritized autonomous task queue

The queue is ordered by risk and dependency. Completed items require linked
evidence; a green unit test alone does not close a milestone.

| Priority | Type | Task | State | Evidence / exit condition |
|---|---|---|---|---|
| P0 | SECURITY / INFRASTRUCTURE | Create the staging-only Render deploy hook and store it in `ping-staging-certification` | DONE | Environment secret present; run 36442340938 requested the hook successfully; production untouched |
| P1 | CERTIFICATION | Run the permanent staging gate for the current M7 candidate | DONE | Run 36453502120: quality PASS, exact health/SHA PASS for bdcf94e, authenticated strong semantic `/agent/turn` E2E PASS, artifact fa70bb15-7489-4fd4-afde-b15ee63e4fce |
| P1 | CERTIFICATION | Verify M7 health, auth, persistence, reload, conversation and safety invariants in staging | DONE | Run 36453502120 strong semantic sequence PASS; prior run 36442340938 auth/re-auth/reload/checkpoint/tombstone/safety PASS; owner-confirmed `PING_M7_PRIVATE_DB_CHECK=PASS`; current artifact reports zero writers/mutations/messages and cleanup PASS |
| P1 | SECURITY | Verify `PING_M7_PRIVATE_DB_CHECK=PASS` in Render staging startup logs | DONE | Owner confirmed the exact non-secret diagnostic line; no secret was copied or recorded |
| P1 | BUG | Correct the real staging objective-switch/return defect structurally and recertify only staging | DONE | Commit bdcf94e; run 36453502120 Turn 8 returns safe clarification, preserves the active objective, clears the pending plan digest and records turn 8; no side effects |
| P2 | QUALITY / TECHNICAL_DEBT | Separate or repair pre-existing full-suite environment failures without weakening the staging gate | DEFERRED | Baseline comparison and reproducible CI result |
| P2 | QUALITY | Strengthen the staging smoke's semantic assertions for objective switch, return, correction, slot isolation, confirmation binding and ambiguity | DONE | Commit 07437bb added strong assertions; the exact staging run executed them and correctly rejected the real objective-return defect |
| P3 | PRODUCT / ARCHITECTURE | Execute the M8 voice transport spike and select architecture from evidence | IN_PROGRESS | Provider-neutral contract/tests pass; staging-only `realtime_webrtc_core_bridge` candidate and telemetry are implemented; publish/build and physical provider measurements remain |
| P4 | QUALITY / CERTIFICATION | Certify the selected live voice adapter on staging and iPhone | BLOCKED_BY_P3 | Requires measured provider choice, staging-only adapter and physical spoken-response evidence |

## Queue rules

- A task is not complete because an implementation exists; it needs evidence.
- A failure is first classified as PRODUCT, SEMANTIC/MODEL, CORE/STATE,
  PERSISTENCE, AUTHORIZATION, SECURITY, HARNESS, FIXTURE, INFRASTRUCTURE,
  NONDETERMINISM or REGRESSION.
- The next task is selected from this queue after each verified result.
