-- Run this SQL in your Supabase SQL Editor to add missing credit fields

-- Add missing credit fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS monthly_base_limit int NOT NULL DEFAULT 50;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS monthly_used int NOT NULL DEFAULT 0;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS monthly_bonus_credits int NOT NULL DEFAULT 0;

-- Update existing free users to have 50 credits
UPDATE public.profiles 
SET monthly_base_limit = 50 
WHERE plan = 'free' AND monthly_base_limit IS NULL;

-- Check the current schema
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;
