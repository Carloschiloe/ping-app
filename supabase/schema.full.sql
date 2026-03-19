-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  expo_push_token TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- messages
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);

-- commitments
CREATE TABLE IF NOT EXISTS commitments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending', -- pending / done
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_commitments_owner_user_id ON commitments(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_commitments_status ON commitments(status);
CREATE INDEX IF NOT EXISTS idx_commitments_due_at ON commitments(due_at);

-- subscriptions
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free', -- free / pro
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- contacts
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(owner_user_id, contact_user_id)
);

-- RLS policies
-- For MVP, we can enable RLS on these tables.
-- Alternatively, if you handle everything server-side using the service role key, RLS can be bypassed for the backend API, but it's good practice to have it.

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;

-- Allow users to see and update only their own data
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile" ON profiles FOR SELECT USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles' AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'Users can view their own messages'
  ) THEN
    CREATE POLICY "Users can view their own messages" ON messages FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'messages' AND policyname = 'Users can insert their own messages'
  ) THEN
    CREATE POLICY "Users can insert their own messages" ON messages FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'commitments' AND policyname = 'Users can view their own commitments'
  ) THEN
    CREATE POLICY "Users can view their own commitments" ON commitments FOR SELECT USING (auth.uid() = owner_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'commitments' AND policyname = 'Users can insert their own commitments'
  ) THEN
    CREATE POLICY "Users can insert their own commitments" ON commitments FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'commitments' AND policyname = 'Users can update their own commitments'
  ) THEN
    CREATE POLICY "Users can update their own commitments" ON commitments FOR UPDATE USING (auth.uid() = owner_user_id);
  END IF;
END $$;

-- trigger to auto-create profile on user signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'on_auth_user_created'
      AND tgrelid = 'auth.users'::regclass
  ) THEN
    DROP TRIGGER on_auth_user_created ON auth.users;
  END IF;
END $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- PHASE MIGRATIONS

-- phase7.sql
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

-- phase14_calendar.sql
-- Phase 14: Direct Cloud Calendar Integration (OAuth)
-- Table to store user's calendar accounts (Google, Outlook, etc.)

CREATE TABLE IF NOT EXISTS user_calendar_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google' or 'outlook'
    email TEXT NOT NULL,
    access_token TEXT NOT NULL, -- Will be encrypted in backend
    refresh_token TEXT,          -- Will be encrypted in backend
    expires_at TIMESTAMP WITH TIME ZONE,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- RLS
ALTER TABLE user_calendar_accounts ENABLE ROW LEVEL SECURITY;

-- Note: In Supabase, if we want to access auth.users, we might need to handle schemas carefully.
-- Usually we reference auth.users for foreign keys.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_calendar_accounts' AND policyname = 'Users can see their own calendar accounts'
  ) THEN
    CREATE POLICY "Users can see their own calendar accounts" 
    ON user_calendar_accounts FOR SELECT 
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_calendar_accounts' AND policyname = 'Users can delete their own calendar accounts'
  ) THEN
    CREATE POLICY "Users can delete their own calendar accounts" 
    ON user_calendar_accounts FOR DELETE 
    USING (auth.uid() = user_id);
  END IF;
END $$;

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'update_calendar_accounts_updated_at'
      AND tgrelid = 'public.user_calendar_accounts'::regclass
  ) THEN
    DROP TRIGGER update_calendar_accounts_updated_at ON public.user_calendar_accounts;
  END IF;
END $$;

CREATE TRIGGER update_calendar_accounts_updated_at
    BEFORE UPDATE ON user_calendar_accounts
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();

-- phase15_autonomous.sql
-- Phase 15: AI-Powered Autonomous Calendar Assistant

-- 1. Add auto-sync preference to calendar accounts
ALTER TABLE user_calendar_accounts 
ADD COLUMN IF NOT EXISTS is_auto_sync_enabled BOOLEAN DEFAULT FALSE;

-- 2. Ensure update_updated_at_column exists (re-runnable)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 3. Add meta JSONB to commitments for sync tracking
ALTER TABLE commitments 
ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb;

-- phase16_ui_ai_persistence.sql
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

-- phase18_chat_features.sql
-- Phase 18: Chat Features Migration

-- 1. Add status column to messages table to track read receipts
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';

-- Valid values: 'sent', 'delivered', 'read'
-- Optional: Adding an index might be useful if we add queries based on status, 
-- but since it's mostly per-conversation, it's okay without it for now.

-- phase18_insights.sql
-- Phase 18: Insights & Performance Optimization
-- This migration adds cached last message info to conversations for faster insights and search.

-- 1. Add columns to conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message_id UUID REFERENCES messages(id),
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_message_text TEXT;

-- 2. Create trigger function to update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET 
        last_message_id = NEW.id,
        last_message_at = NEW.created_at,
        last_message_text = CASE 
            WHEN NEW.text IS NOT NULL THEN (
                CASE 
                    WHEN length(NEW.text) > 100 THEN left(NEW.text, 97) || '...'
                    ELSE NEW.text 
                END
            )
            ELSE '[Archivo]' 
        END
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS tr_update_conversation_last_message ON messages;
CREATE TRIGGER tr_update_conversation_last_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_last_message();

-- 4. Initial backfill (Optional but recommended)
UPDATE conversations c
SET 
  last_message_id = m.id,
  last_message_at = m.created_at,
  last_message_text = m.text
FROM (
  SELECT DISTINCT ON (conversation_id) id, conversation_id, created_at, text
  FROM messages
  ORDER BY conversation_id, created_at DESC
) AS m
WHERE c.id = m.conversation_id;

-- phase23_privacy.sql
-- Phase 23: Privacy & Security
-- Add privacy preference columns to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS privacy_read_receipts BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS privacy_last_seen BOOLEAN DEFAULT TRUE;

-- phase26_group_tasks.sql
-- Phase 26: Shared Group Commitments
-- Extend the commitments table to support group task assignment

ALTER TABLE commitments
ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS group_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_group_task BOOLEAN DEFAULT FALSE;

-- Index for quickly fetching tasks assigned to a specific user
CREATE INDEX IF NOT EXISTS idx_commitments_assigned_to ON commitments(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_group_conv ON commitments(group_conversation_id) WHERE group_conversation_id IS NOT NULL;

-- phase29_calls.sql
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

-- phase30_commitments_realtime.sql
-- Phase 30: Enable Supabase Realtime for Commitments
-- Adds commitments table to the realtime publication and sets up RLS policies

-- 1. Enable logical replication for realtime
BEGIN;
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'commitments'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE commitments;
    END IF;
END $$;
COMMIT;

-- 2. Ensure RLS is enabled (should already be, but safe to verify)
ALTER TABLE commitments ENABLE ROW LEVEL SECURITY;

-- 3. Ensure SELECT policies allow owner AND assignee to read the commitment
-- Drop existing policies if they conflict or exist to recreate them cleanly
DROP POLICY IF EXISTS "Users can view commitments they own or are assigned to" ON commitments;
DROP POLICY IF EXISTS "Users can view own commitments" ON commitments;
DROP POLICY IF EXISTS "Users can view assigned commitments" ON commitments;
DROP POLICY IF EXISTS "Participants can view group commitments" ON commitments;

CREATE POLICY "Users can view commitments they own or are assigned to"
ON commitments FOR SELECT
TO authenticated
USING (
    owner_user_id = auth.uid() 
    OR assigned_to_user_id = auth.uid()
    OR (
        is_group_task = true 
        AND group_conversation_id IN (
            SELECT conversation_id FROM conversation_participants WHERE user_id = auth.uid()
        )
    )
);

-- Note: App creates commitments via Service Role, but we'll add rudimentary rules for completeness
DROP POLICY IF EXISTS "Users can update commitments they own or are assigned to" ON commitments;
CREATE POLICY "Users can update commitments they own or are assigned to"
ON commitments FOR UPDATE
TO authenticated
USING (
    owner_user_id = auth.uid() 
    OR assigned_to_user_id = auth.uid()
);

-- phase31_operation_mode.sql
-- Phase 31: Conversation operation mode MVP

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'chat';

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'conversations_mode_check'
    ) THEN
        ALTER TABLE conversations
        ADD CONSTRAINT conversations_mode_check
        CHECK (mode IN ('chat', 'operation'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS operation_checklists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_checklists_conversation
ON operation_checklists(conversation_id, is_active, updated_at DESC);

CREATE TABLE IF NOT EXISTS operation_checklist_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES operation_checklists(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_operation_checklist_items_checklist
ON operation_checklist_items(checklist_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS operation_checklist_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checklist_id UUID NOT NULL REFERENCES operation_checklists(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    run_date DATE NOT NULL,
    created_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(checklist_id, run_date)
);

CREATE INDEX IF NOT EXISTS idx_operation_checklist_runs_conversation
ON operation_checklist_runs(conversation_id, run_date DESC);

CREATE TABLE IF NOT EXISTS operation_checklist_run_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES operation_checklist_runs(id) ON DELETE CASCADE,
    template_item_id UUID REFERENCES operation_checklist_items(id) ON DELETE SET NULL,
    label TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at TIMESTAMPTZ,
    checked_by_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(run_id, template_item_id)
);

CREATE INDEX IF NOT EXISTS idx_operation_checklist_run_items_run
ON operation_checklist_run_items(run_id, sort_order ASC);

CREATE TABLE IF NOT EXISTS shift_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'text',
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_reports_conversation
ON shift_reports(conversation_id, created_at DESC);

-- phase32_operation_focus.sql
-- Phase 32: Focus operation mode on one active commitment

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS active_commitment_id UUID REFERENCES commitments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_active_commitment
ON conversations(active_commitment_id);

-- phase33_operation_user_focus.sql
-- Phase 33: User-specific operation focus and progress

CREATE TABLE IF NOT EXISTS conversation_operation_focuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    commitment_id UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(conversation_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_operation_focuses_conversation
ON conversation_operation_focuses(conversation_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_operation_focuses_user
ON conversation_operation_focuses(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS commitment_operation_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    commitment_id UUID NOT NULL REFERENCES commitments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'ready',
    acknowledged_at TIMESTAMPTZ,
    arrived_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    latest_location_message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
    completion_note TEXT,
    completion_outcome TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(commitment_id, user_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commitment_operation_progress_status_check'
    ) THEN
        ALTER TABLE commitment_operation_progress
        ADD CONSTRAINT commitment_operation_progress_status_check
        CHECK (status IN ('ready', 'started', 'arrived', 'completed'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'commitment_operation_progress_outcome_check'
    ) THEN
        ALTER TABLE commitment_operation_progress
        ADD CONSTRAINT commitment_operation_progress_outcome_check
        CHECK (completion_outcome IS NULL OR completion_outcome IN ('resolved', 'pending_followup', 'needs_review'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_commitment_operation_progress_commitment
ON commitment_operation_progress(commitment_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_commitment_operation_progress_user
ON commitment_operation_progress(user_id, updated_at DESC);

ALTER TABLE operation_checklists
ADD COLUMN IF NOT EXISTS category_label TEXT;

ALTER TABLE operation_checklists
ADD COLUMN IF NOT EXISTS responsible_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL;

ALTER TABLE operation_checklists
ADD COLUMN IF NOT EXISTS responsible_role_label TEXT;

ALTER TABLE operation_checklists
ADD COLUMN IF NOT EXISTS frequency TEXT NOT NULL DEFAULT 'manual';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'operation_checklists_frequency_check'
    ) THEN
        ALTER TABLE operation_checklists
        ADD CONSTRAINT operation_checklists_frequency_check
        CHECK (frequency IN ('manual', 'daily', 'shift'));
    END IF;
END $$;

-- phase34_checklist_results.sql
-- Phase 34: Checklist item results and traceability

ALTER TABLE operation_checklist_run_items
ADD COLUMN IF NOT EXISTS result TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'operation_checklist_run_items_result_check'
    ) THEN
        ALTER TABLE operation_checklist_run_items
        ADD CONSTRAINT operation_checklist_run_items_result_check
        CHECK (result IS NULL OR result IN ('good', 'regular', 'bad', 'na'));
    END IF;
END $$;

-- phase35_group_admin_roles.sql
-- Phase 35: Group admin roles per participant

ALTER TABLE conversation_participants
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'conversation_participants_role_check'
    ) THEN
        ALTER TABLE conversation_participants
        ADD CONSTRAINT conversation_participants_role_check
        CHECK (role IN ('member', 'admin'));
    END IF;
END $$;

UPDATE conversation_participants cp
SET role = 'admin'
FROM conversations c
WHERE cp.conversation_id = c.id
  AND cp.user_id = c.admin_id
  AND c.admin_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_conversation_participants_role
ON conversation_participants(conversation_id, role);

-- phase36_checklist_response_types.sql
-- Phase 36: Checklist archive visibility and per-item response types

ALTER TABLE operation_checklist_items
ADD COLUMN IF NOT EXISTS response_type TEXT NOT NULL DEFAULT 'condition';

ALTER TABLE operation_checklist_run_items
ADD COLUMN IF NOT EXISTS response_type TEXT NOT NULL DEFAULT 'condition';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'operation_checklist_items_response_type_check'
    ) THEN
        ALTER TABLE operation_checklist_items
        ADD CONSTRAINT operation_checklist_items_response_type_check
        CHECK (response_type IN ('condition', 'severity', 'yes_no', 'text'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'operation_checklist_run_items_response_type_check'
    ) THEN
        ALTER TABLE operation_checklist_run_items
        ADD CONSTRAINT operation_checklist_run_items_response_type_check
        CHECK (response_type IN ('condition', 'severity', 'yes_no', 'text'));
    END IF;
END $$;

ALTER TABLE operation_checklist_run_items
DROP CONSTRAINT IF EXISTS operation_checklist_run_items_result_check;

ALTER TABLE operation_checklist_run_items
ADD CONSTRAINT operation_checklist_run_items_result_check
CHECK (
    result IS NULL OR result IN (
        'good', 'regular', 'bad', 'na',
        'high', 'medium', 'low',
        'yes', 'no'
    )
);
