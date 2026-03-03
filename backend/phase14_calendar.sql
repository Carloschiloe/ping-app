-- Phase 14: Direct Cloud Calendar Integration (OAuth)
-- Table to store user's calendar accounts (Google, Outlook, etc.)

CREATE TABLE IF NOT EXISTS user_calendar_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL, -- 'google' or 'outlook'
    email TEXT NOT NULL,
    access_token TEXT NOT NULL, -- Will be encrypted in backend
    refresh_token TEXT,          -- Will be encrypted in backend
    expires_at TIMESTAMP WITH TIME ZONE,
    meta JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- RLS
ALTER TABLE user_calendar_accounts ENABLE ROW LEVEL SECURITY;

-- Note: In Supabase, if we want to access auth.users, we might need to handle schemas carefully.
-- Usually we reference auth.users for foreign keys.

CREATE POLICY "Users can see their own calendar accounts" 
ON user_calendar_accounts FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar accounts" 
ON user_calendar_accounts FOR DELETE 
USING (auth.uid() = user_id);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_calendar_accounts_updated_at
    BEFORE UPDATE ON user_calendar_accounts
    FOR EACH ROW
    EXECUTE PROCEDURE update_updated_at_column();
