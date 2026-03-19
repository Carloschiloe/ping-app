-- 1. Presence: Add last_seen to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- 2. Archiving: Add archived to conversation_participants
ALTER TABLE conversation_participants ADD COLUMN IF NOT EXISTS archived BOOLEAN DEFAULT FALSE;

-- 3. AI History: Create ai_messages table
CREATE TABLE IF NOT EXISTS ai_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    is_ai BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Enable RLS for ai_messages
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can see their own AI history'
  ) THEN
    CREATE POLICY "Users can see their own AI history" 
        ON ai_messages FOR SELECT 
        USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can insert their own AI history'
  ) THEN
    CREATE POLICY "Users can insert their own AI history" 
        ON ai_messages FOR INSERT 
        WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_messages' AND policyname = 'Users can delete their own AI history'
  ) THEN
    CREATE POLICY "Users can delete their own AI history" 
        ON ai_messages FOR DELETE 
        USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Enable Realtime (Optional for AI history, but good practice)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'ai_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE ai_messages;
  END IF;
END $$;
