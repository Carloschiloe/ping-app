-- Phase 7: Replies and Reactions

-- 1. Add reply_to_id to messages
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- 2. Create message_reactions table
CREATE TABLE IF NOT EXISTS message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- (Optional) Enforce one unique reaction emoji per user per message
    UNIQUE(message_id, user_id, emoji)
);

-- 3. Enable RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- 4. Policies
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'message_reactions' AND policyname = 'Users can see all reactions'
  ) THEN
    CREATE POLICY "Users can see all reactions"
      ON message_reactions FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'message_reactions' AND policyname = 'Users can insert their own reactions'
  ) THEN
    CREATE POLICY "Users can insert their own reactions"
      ON message_reactions FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'message_reactions' AND policyname = 'Users can delete their own reactions'
  ) THEN
    CREATE POLICY "Users can delete their own reactions"
      ON message_reactions FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- 5. Enable Replication for Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE message_reactions;
  END IF;
END $$;
