-- Phase 29: Intelligent Calling persistence

CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resource_id TEXT, -- Agora Resource ID
    sid TEXT,         -- Agora Session ID
    status TEXT DEFAULT 'started', -- 'started', 'recording', 'stopped', 'processed'
    recorder_uid INTEGER,
    summary TEXT,
    transcript TEXT,
    meta JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'calls' AND policyname = 'Users can see calls from their conversations'
  ) THEN
    CREATE POLICY "Users can see calls from their conversations"
        ON calls FOR SELECT
        USING (
            EXISTS (
                SELECT 1 FROM conversations 
                WHERE conversations.id = calls.conversation_id
            )
        );
  END IF;
END $$;

-- Enable replication for Realtime if needed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE calls;
  END IF;
END $$;
