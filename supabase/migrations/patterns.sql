-- Patterns of play table. Run in Supabase SQL Editor.
-- A pattern is created from a board (snapshot of placed pieces + objects)
-- plus end-positions for animation playback.

CREATE TABLE IF NOT EXISTS public.patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Untitled Pattern',
  description text,
  source_board_id uuid REFERENCES public.boards(id) ON DELETE SET NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS patterns_team_id_idx ON public.patterns(team_id);

ALTER TABLE public.patterns ENABLE ROW LEVEL SECURITY;

-- Members can read patterns for their team
CREATE POLICY "patterns_select" ON public.patterns
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = patterns.team_id AND tm.user_id = auth.uid()
    )
  );

-- Editors and admins can insert
CREATE POLICY "patterns_insert" ON public.patterns
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = patterns.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );

-- Editors and admins can update
CREATE POLICY "patterns_update" ON public.patterns
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = patterns.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );

-- Editors and admins can delete
CREATE POLICY "patterns_delete" ON public.patterns
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.team_members tm
      WHERE tm.team_id = patterns.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('admin', 'editor')
    )
  );
