CREATE OR REPLACE FUNCTION private.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'admin'::app_role)
$$;

REVOKE ALL ON FUNCTION private.is_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit integer DEFAULT 100)
 RETURNS TABLE(session_id uuid, user_id uuid, full_name text, avatar_url text, overall_score numeric, audio_score numeric, video_score numeric, overall_grade text, mode text, completed_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id AS session_id,
    s.user_id,
    p.full_name,
    p.avatar_url,
    s.overall_score,
    s.audio_score,
    s.video_score,
    s.overall_grade,
    s.mode,
    s.completed_at
  FROM (
    SELECT DISTINCT ON (s.user_id)
      s.id, s.user_id, s.overall_score, s.audio_score, s.video_score, s.overall_grade, s.mode, s.completed_at
    FROM public.assessment_sessions s
    WHERE s.status = 'completed' AND s.overall_score IS NOT NULL
      AND NOT private.is_admin(s.user_id)
    ORDER BY s.user_id, s.overall_score DESC, s.completed_at DESC
  ) s
  JOIN public.profiles p ON p.id = s.user_id
  ORDER BY s.overall_score DESC, s.completed_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1);
$function$;