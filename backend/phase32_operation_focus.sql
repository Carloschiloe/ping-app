-- Phase 32: Focus operation mode on one active commitment

ALTER TABLE conversations
ADD COLUMN IF NOT EXISTS active_commitment_id UUID REFERENCES commitments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_active_commitment
ON conversations(active_commitment_id);
