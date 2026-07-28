
DROP VIEW IF EXISTS public.leaderboard;

CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit int DEFAULT 100)
RETURNS TABLE (
  session_id uuid,
  user_id uuid,
  full_name text,
  avatar_url text,
  overall_score numeric,
  overall_grade text,
  completed_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT ON (s.user_id)
    s.id AS session_id,
    s.user_id,
    p.full_name,
    p.avatar_url,
    s.overall_score,
    s.overall_grade,
    s.completed_at
  FROM public.assessment_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.status = 'completed' AND s.overall_score IS NOT NULL
  ORDER BY s.user_id, s.overall_score DESC, s.completed_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1);
$$;

-- The function runs as the caller (SECURITY INVOKER). To let anyone view the
-- public leaderboard without exposing full profile/session rows, we grant
-- narrow SELECT on only the ranking-relevant columns of the underlying tables.
GRANT SELECT (id, user_id, overall_score, overall_grade, completed_at, status)
  ON public.assessment_sessions TO anon, authenticated;
GRANT SELECT (id, full_name, avatar_url)
  ON public.profiles TO anon, authenticated;

-- Allow anon/authenticated to read completed rows for leaderboard purposes.
DROP POLICY IF EXISTS assessment_sessions_leaderboard_read ON public.assessment_sessions;
CREATE POLICY assessment_sessions_leaderboard_read
  ON public.assessment_sessions
  FOR SELECT
  TO anon, authenticated
  USING (status = 'completed' AND overall_score IS NOT NULL);

DROP POLICY IF EXISTS profiles_leaderboard_read ON public.profiles;
CREATE POLICY profiles_leaderboard_read
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.assessment_sessions s
      WHERE s.user_id = profiles.id
        AND s.status = 'completed'
        AND s.overall_score IS NOT NULL
    )
  );

GRANT EXECUTE ON FUNCTION public.get_leaderboard(int) TO anon, authenticated;
