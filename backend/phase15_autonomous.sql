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

-- 3. We use the 'meta' JSONB in commitments for:
-- - synced_to: 'google' | 'outlook'
-- - cloud_event_id: string
-- - external_event_url: string (Direct link to calendar event)
-- - conflict_detected: boolean
-- - sync_status: 'synced' | 'pending' | 'failed'
