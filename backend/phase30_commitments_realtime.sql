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
