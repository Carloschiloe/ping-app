-- Phase 29: Intelligent Calling persistence

CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    resource_id TEXT, -- Agora Resource ID
    sid TEXT,         -- Agora Session ID
    status TEXT DEFAULT 'started', -- 'started', 'recording', 'stopped', 'processed'
    recorder_uid INTEGER,
    summary TEXT,
    transcript TEXT,
    meta JSONB DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can see calls from their conversations"
    ON calls FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = calls.conversation_id
        )
    );

-- Enable replication for Realtime if needed
ALTER PUBLICATION supabase_realtime ADD TABLE calls;
