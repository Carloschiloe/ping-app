-- Phase 23: Privacy & Security
-- Add privacy preference columns to profiles table

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS privacy_read_receipts BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS privacy_last_seen BOOLEAN DEFAULT TRUE;
