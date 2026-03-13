-- Migration: Add type to commitments
ALTER TABLE commitments ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'task';

-- Optional: Update existing records that might be meetings based on title keywords
UPDATE commitments 
SET type = 'meeting' 
WHERE title ILIKE '%reunión%' 
   OR title ILIKE '%llamada%' 
   OR title ILIKE '%junta%'
   OR title ILIKE '%call%';
