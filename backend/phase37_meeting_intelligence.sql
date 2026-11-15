-- Phase 37: meeting intelligence (PREPARED, NOT APPLIED).
-- Apply only with the owner's explicit approval. Every statement can run
-- more than once without harm.

-- 1. Recordings stop being public. Today the bucket is public: anyone with a
--    file's address could download it. The server reads it with its own key,
--    so nothing in the app depends on it being public.
UPDATE storage.buckets SET public = false WHERE id = 'recordings';

-- 2. Everybody in the call says yes before anything is recorded.
CREATE TABLE IF NOT EXISTS call_recording_consents (
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    PRIMARY KEY (call_id, user_id)
);
ALTER TABLE call_recording_consents ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'call_recording_consents' AND policyname = 'Own consent is visible') THEN
    CREATE POLICY "Own consent is visible" ON call_recording_consents FOR SELECT USING (user_id = auth.uid());
  END IF;
END $$;

-- 3. One durable job per recording and pipeline version: a restart of the
--    server picks it up again, and the unique key stops double processing.
CREATE TABLE IF NOT EXISTS meeting_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
    pipeline_version TEXT NOT NULL,
    requested_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'processed', 'failed', 'cancelled')),
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    locked_at TIMESTAMPTZ,
    locked_by TEXT,
    last_error TEXT,
    transcriber TEXT,
    analyzer TEXT,
    audio_seconds INTEGER,
    cost_usd NUMERIC(10, 6),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (call_id, pipeline_version)
);
CREATE INDEX IF NOT EXISTS meeting_jobs_due ON meeting_jobs (status, next_attempt_at);
ALTER TABLE meeting_jobs ENABLE ROW LEVEL SECURITY; -- server only: no policies

-- 4. What the meeting left: structured result, and when the audio was deleted.
ALTER TABLE calls ADD COLUMN IF NOT EXISTS analysis JSONB;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS recording_seconds INTEGER;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS audio_deleted_at TIMESTAMPTZ;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_delete_after TIMESTAMPTZ;

-- 5. Proposals from a meeting carry a key, so a retry never repeats one.
ALTER TABLE commitment_proposals ADD COLUMN IF NOT EXISTS source_dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS commitment_proposals_source_dedupe
    ON commitment_proposals (source_dedupe_key) WHERE source_dedupe_key IS NOT NULL;

-- 6. Calls are visible only to people in that conversation (today the rule
--    leans on the conversations table's own rule; this says it directly).
DROP POLICY IF EXISTS "Users can see calls from their conversations" ON calls;
CREATE POLICY "Users can see calls from their conversations" ON calls FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM conversation_participants cp
        WHERE cp.conversation_id = calls.conversation_id AND cp.user_id = auth.uid()
    )
);
