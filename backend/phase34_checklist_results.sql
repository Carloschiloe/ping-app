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
