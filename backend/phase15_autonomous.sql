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
