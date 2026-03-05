-- Phase 18: Chat Features Migration

-- 1. Add status column to messages table to track read receipts
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'sent';

-- Valid values: 'sent', 'delivered', 'read'
-- Optional: Adding an index might be useful if we add queries based on status, 
-- but since it's mostly per-conversation, it's okay without it for now.
