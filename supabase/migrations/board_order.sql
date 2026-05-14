-- Per-user board ordering. Run in Supabase SQL Editor.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS board_order jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Note: existing RLS policies on team_members already cover this column.
-- Each user reorders their own team_members row.
