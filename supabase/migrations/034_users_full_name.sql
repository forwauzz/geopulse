-- Add full_name to users table for profile collection during signup
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS full_name TEXT;
