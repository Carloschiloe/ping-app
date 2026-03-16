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
