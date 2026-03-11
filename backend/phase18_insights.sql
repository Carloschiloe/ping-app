-- Phase 18: Insights & Performance Optimization
-- This migration adds cached last message info to conversations for faster insights and search.

-- 1. Add columns to conversations
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS last_message_id UUID REFERENCES messages(id),
ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_message_text TEXT;

-- 2. Create trigger function to update conversation on new message
CREATE OR REPLACE FUNCTION update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET 
        last_message_id = NEW.id,
        last_message_at = NEW.created_at,
        last_message_text = CASE 
            WHEN NEW.text IS NOT NULL THEN (
                CASE 
                    WHEN length(NEW.text) > 100 THEN left(NEW.text, 97) || '...'
                    ELSE NEW.text 
                END
            )
            ELSE '[Archivo]' 
        END
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Create the trigger
DROP TRIGGER IF EXISTS tr_update_conversation_last_message ON messages;
CREATE TRIGGER tr_update_conversation_last_message
AFTER INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION update_conversation_last_message();

-- 4. Initial backfill (Optional but recommended)
UPDATE conversations c
SET 
  last_message_id = m.id,
  last_message_at = m.created_at,
  last_message_text = m.text
FROM (
  SELECT DISTINCT ON (conversation_id) id, conversation_id, created_at, text
  FROM messages
  ORDER BY conversation_id, created_at DESC
) AS m
WHERE c.id = m.conversation_id;
