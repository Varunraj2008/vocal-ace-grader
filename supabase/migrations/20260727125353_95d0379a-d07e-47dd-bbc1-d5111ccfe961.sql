CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM anon;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

DROP POLICY IF EXISTS admin_logs_admin_insert ON public.admin_logs;
DROP POLICY IF EXISTS admin_logs_admin_only ON public.admin_logs;
CREATE POLICY admin_logs_admin_insert ON public.admin_logs FOR INSERT TO authenticated
  WITH CHECK (private.has_role(auth.uid(), 'admin') AND admin_id = auth.uid());
CREATE POLICY admin_logs_admin_only ON public.admin_logs FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS analysis_owner_or_admin ON public.analysis_results;
CREATE POLICY analysis_owner_or_admin ON public.analysis_results FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = analysis_results.recording_id
    AND (r.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))));

DROP POLICY IF EXISTS transcripts_owner_or_admin ON public.transcripts;
CREATE POLICY transcripts_owner_or_admin ON public.transcripts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.recordings r WHERE r.id = transcripts.recording_id
    AND (r.user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))));

DROP POLICY IF EXISTS recordings_owner_or_admin ON public.recordings;
CREATE POLICY recordings_owner_or_admin ON public.recordings FOR ALL TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS user_roles_select_own_or_admin ON public.user_roles;
CREATE POLICY user_roles_select_own_or_admin ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS sessions_select_completed_public ON public.assessment_sessions;
DROP POLICY IF EXISTS sessions_select_own_or_admin ON public.assessment_sessions;
DROP POLICY IF EXISTS sessions_update_own_or_admin ON public.assessment_sessions;
CREATE POLICY sessions_select_own_or_admin ON public.assessment_sessions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
CREATE POLICY sessions_update_own_or_admin ON public.assessment_sessions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_own_or_admin ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR private.has_role(auth.uid(), 'admin'));
REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT ON public.assessment_sessions FROM anon;

DROP VIEW IF EXISTS public.leaderboard;
CREATE VIEW public.leaderboard
WITH (security_invoker = false) AS
  SELECT DISTINCT ON (s.user_id)
    s.user_id,
    p.full_name,
    p.avatar_url,
    s.id AS session_id,
    s.overall_score,
    s.overall_grade,
    s.completed_at
  FROM public.assessment_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.status = 'completed' AND s.overall_score IS NOT NULL
  ORDER BY s.user_id, s.overall_score DESC, s.completed_at DESC;
GRANT SELECT ON public.leaderboard TO anon, authenticated;

DROP POLICY IF EXISTS recordings_read_own_or_admin ON storage.objects;
CREATE POLICY recordings_read_own_or_admin ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'recordings' AND ((storage.foldername(name))[1] = auth.uid()::text
    OR private.has_role(auth.uid(), 'admin')));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);