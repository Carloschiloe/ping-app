-- M-1H FINAL — native full-text retrieval parity for commitment_proposals.
--
-- Ticket "M-1H FINAL: WORLD-CLASS AGENT QUERY ARCHITECTURE" (sección 7):
-- audited the real, already-certified commitments FTS
-- (20260903150000_full_text_retrieval.sql) and confirmed the correct,
-- non-degrading answer for topic-query parity between `commitment` and
-- `commitment_proposal` is the SAME mechanism, not a JS-side bounded-window
-- approximation (that approximation, introduced in M-1H.1, is fully removed
-- from the application code in this same delivery — see
-- backend/src/services/retrieval.service.ts). A bounded candidate window can
-- never be a correctness-equivalent substitute for a real index when the
-- table can legitimately hold more matching rows than any reasoned fetch
-- limit -- only a real GIN-indexed tsvector column guarantees the retrieval
-- layer sees EVERY authorized matching row, not just however many fit in an
-- overfetch window.
--
-- Additive only: one generated column + one index. Never touches existing
-- columns, rows, constraints, or application code paths that don't opt in to
-- it. Non-destructive, reversible (see rollback note at the bottom),
-- consistent with every prior migration in this repo.
--
-- Mirrors the commitments migration EXACTLY:
--   - same custom text search config (`public.ping_text`, already created by
--     20260903150000_full_text_retrieval.sql — this migration depends on it
--     existing, never redefines it)
--   - same GENERATED ALWAYS ... STORED approach (zero triggers, always in
--     sync with source columns by construction)
--   - same weight structure BY FIELD ROLE (never by vocabulary/industry/
--     language): A = title (primary label), B = description/expected_result
--     (main narrative). `commitment_proposals` has no `next_action` column
--     (that's commitments-only) and no `resolution_result` column (a
--     proposal, by definition, is never "resolved" — see
--     commitment_proposals_status_check: pending/confirmed/rejected only) --
--     weight C here is `rejection_reason` alone, the proposal-equivalent of
--     commitments' outcome/audit tier. This is a justified, documented
--     structural difference (real schema difference), never an invented
--     field.

alter table public.commitment_proposals
    add column search_tsv tsvector
    generated always as (
        setweight(to_tsvector('public.ping_text', coalesce(title, '')), 'A')
        || setweight(to_tsvector('public.ping_text',
            coalesce(description, '') || ' ' || coalesce(expected_result, '')
        ), 'B')
        || setweight(to_tsvector('public.ping_text',
            coalesce(rejection_reason, '')
        ), 'C')
    ) stored;

create index commitment_proposals_search_tsv_idx
    on public.commitment_proposals using gin (search_tsv);

-- Rollback (manual, if ever needed — not part of this delivery, no remote
-- migration is applied by this ticket):
--   drop index if exists public.commitment_proposals_search_tsv_idx;
--   alter table public.commitment_proposals drop column if exists search_tsv;
