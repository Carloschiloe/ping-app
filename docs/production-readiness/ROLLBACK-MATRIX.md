# Production rollback matrix

Rollback is not a promise that reverses arbitrary data mutations. The first
choice is to stop forward rollout and preserve evidence.

| Failure | Immediate action | Recovery | Rollback target |
|---|---|---|---|
| Service fails before DB change | Stop deployment; inspect logs | Restore previous service config | `b6b7175f9b87abfa5fda422931f8e4c4fa92f5c8` |
| App/RC runtime error with healthy DB | Revert service to prior artifact | Fix in staging, re-certify | `b6b7175f9b87abfa5fda422931f8e4c4fa92f5c8` |
| Additive migration fails before commit | Stop migration; preserve error | Correct migration and rehearse | No blind SQL rollback |
| RLS/auth regression | Disable release path; preserve DB | Restore reviewed backup or apply reviewed forward fix | Service rollback only if schema remains compatible |
| Data integrity concern | Stop all writes if safe; preserve backup | Restore into disposable target and compare | Backup restore under separate authorization |
| Provider/runtime configuration error | Revert configuration | Correct env in staging | Keep DB unchanged |

Never run a destructive down migration or `supabase db reset` against the
historical production project as an emergency shortcut.
