-- Unify user identification in messages table
-- 1. Ensure all data is synced to sender_id
UPDATE messages SET sender_id = user_id WHERE sender_id IS NULL;

-- 2. Update RLS policies to use sender_id
DROP POLICY IF EXISTS "Users can view their own messages" ON messages;
CREATE POLICY "Users can view their own messages" ON messages FOR SELECT USING (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Users can insert their own messages" ON messages;
CREATE POLICY "Users can insert their own messages" ON messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- 3. (Optional but recommended) Add NOT NULL constraint to sender_id if it's already fully populated
ALTER TABLE messages ALTER COLUMN sender_id SET NOT NULL;

-- 4. Mark user_id for deletion (we'll drop it later after code updates)
-- ALTER TABLE messages DROP COLUMN user_id; 
