# Implementation Notes

This document summarizes the changes applied during the technical audit improvements.

## Backend
- Cron/job coordination: added a single entry point with overlap guards so scheduled jobs do not run concurrently.
- Encryption key enforcement: removed default key fallback; `ENCRYPTION_KEY` is required at runtime.
- Schema tooling: added a script to compose `supabase/schema.full.sql` from base schema plus `backend/phase*.sql`.
- Push notifications: reduced N+1 queries, limited payload selection, and added duration/volume logging.
- Commitment service: reduced payload size on selects/inserts, removed sensitive logs, and kept `meta` where required.
- Controller logs: removed debug logs with message content and standardized error logging without leaking request payloads.

## Database (Supabase)
- Base schema is now safe to reapply for tables/indexes.
- Policy creation and realtime publication additions are guarded to avoid "already exists" errors.
- Trigger creation is idempotent by dropping and recreating when needed.

## Mobile (React Native)
- Refactored large screens into components for maintainability:
  - `ReactionsModal`, `SummaryModal`, `MessageActionsModal`
  - `ConversationRow`, `GlobalSearchSection`
- Centralized API usage via `apiClient` for global search.
- Hook dependencies and unused imports cleaned up; lint now passes.
- Presence subscriptions stabilized to avoid re-subscription churn.

## Verification
- `npm run build` (backend) passed after each backend change.
- `npm run lint` (mobile) passes with zero warnings.

## Operational Flags
- `RUN_CRON_JOBS` controls background jobs in the backend.
- `ENCRYPTION_KEY` is mandatory for calendar token encryption.
