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
