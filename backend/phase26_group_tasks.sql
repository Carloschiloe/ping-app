-- Phase 26: Shared Group Commitments
-- Extend the commitments table to support group task assignment

ALTER TABLE commitments
ADD COLUMN IF NOT EXISTS assigned_to_user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS group_conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS is_group_task BOOLEAN DEFAULT FALSE;

-- Index for quickly fetching tasks assigned to a specific user
CREATE INDEX IF NOT EXISTS idx_commitments_assigned_to ON commitments(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitments_group_conv ON commitments(group_conversation_id) WHERE group_conversation_id IS NOT NULL;
