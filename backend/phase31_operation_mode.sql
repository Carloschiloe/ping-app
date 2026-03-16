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
