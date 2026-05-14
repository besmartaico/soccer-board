-- Run this in Supabase SQL Editor:

CREATE TABLE IF NOT EXISTS public.team_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  picture_url text NOT NULL,
  jersey_number integer NOT NULL,
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, external_id)
);

CREATE INDEX IF NOT EXISTS team_roster_team_id_idx ON public.team_roster(team_id);

-- Row Level Security: only team members can read; only editor/admin can write.
ALTER TABLE public.team_roster ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS team_roster_select ON public.team_roster;
CREATE POLICY team_roster_select ON public.team_roster
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_roster.team_id
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS team_roster_modify ON public.team_roster;
CREATE POLICY team_roster_modify ON public.team_roster
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = team_roster.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );
