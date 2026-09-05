-- M-1C — Full-text retrieval: generated tsvector columns + GIN indexes for
-- messages.content, commitments (weighted), audio_transcriptions.transcript_text.
--
-- Ping is a GLOBAL, horizontal, domain-agnostic product — content can be
-- Spanish, English, Portuguese, mixed, proper nouns, codes, numbers. A
-- language-specific config (e.g. 'spanish') was evaluated and REJECTED: it
-- destructively stems proper nouns regardless of their actual language
-- (verified: 'spanish' turns "Proyecto Aurora" into 'proyect'/'auror' —
-- wrong for a name that should stay intact). See
-- docs/M-1C-FULL-TEXT-RETRIEVAL.md, "Configuración lingüística" for the full
-- verified comparison.
--
-- Chosen instead: a custom text search configuration `public.ping_text` —
-- the built-in 'simple' parser (no language-specific stemming at all, so no
-- language is privileged over another) with `unaccent` layered in front of
-- it, so diacritics fold consistently regardless of language ("producción"
-- and "produccion" match each other, same for any other language's
-- accents) without destructively stemming words in ANY language. Verified
-- tradeoff: this loses cross-language plural/singular stemming (e.g.
-- "vacaciones" alone won't match a query for "vacacion") — accepted as the
-- fairer tradeoff for a product that must not privilege one language's
-- grammar. NOTE (M-1C.1): the service's actual queries use
-- websearch_to_tsquery, which does NOT do prefix matching (`term:*`) at
-- all — an earlier claim that prefix matching mitigated this or covered
-- typo tolerance was verified FALSE and corrected. See
-- docs/M-1C-FULL-TEXT-RETRIEVAL.md, "Prefix vs typo/fuzzy — verificación
-- empírica (M-1C.1)".
--
-- Approach: GENERATED ALWAYS AS ... STORED columns (option A from the
-- ticket) — zero triggers, zero manual maintenance, always in sync with the
-- source columns by construction.

create extension if not exists unaccent;

-- Independent new config (copy = simple clones the built-in 'simple' config
-- as a starting point; it does NOT modify the built-in 'simple' itself).
create text search configuration public.ping_text (copy = simple);
alter text search configuration public.ping_text
    alter mapping for hword, hword_part, word
    with unaccent, simple;

-- ─── messages.content ───────────────────────────────────────────────────────
alter table public.messages
    add column content_tsv tsvector
    generated always as (to_tsvector('public.ping_text', coalesce(content, ''))) stored;

create index messages_content_tsv_idx on public.messages using gin (content_tsv);

-- ─── commitments: weighted across title / narrative / outcome fields ───────
-- A: title (primary label) — B: description/expected_result/next_action
-- (main narrative) — C: resolution_result/rejection_reason (outcome/audit,
-- still searchable but lower relevance). Weights are structural (by FIELD
-- role), never tied to any specific vocabulary, industry, or language.
alter table public.commitments
    add column search_tsv tsvector
    generated always as (
        setweight(to_tsvector('public.ping_text', coalesce(title, '')), 'A')
        || setweight(to_tsvector('public.ping_text',
            coalesce(description, '') || ' ' || coalesce(expected_result, '') || ' ' || coalesce(next_action, '')
        ), 'B')
        || setweight(to_tsvector('public.ping_text',
            coalesce(resolution_result, '') || ' ' || coalesce(rejection_reason, '')
        ), 'C')
    ) stored;

create index commitments_search_tsv_idx on public.commitments using gin (search_tsv);

-- ─── audio_transcriptions.transcript_text ───────────────────────────────────
-- Partial index: only 'completed' transcripts are ever searched (retrieval
-- service always filters status='completed' — see retrieveTranscriptions).
alter table public.audio_transcriptions
    add column transcript_tsv tsvector
    generated always as (to_tsvector('public.ping_text', coalesce(transcript_text, ''))) stored;

create index audio_transcriptions_tsv_idx on public.audio_transcriptions
    using gin (transcript_tsv) where status = 'completed';
