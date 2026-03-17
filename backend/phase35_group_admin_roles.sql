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
