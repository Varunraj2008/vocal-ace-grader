-- 1. Extend assessment_sessions
ALTER TABLE public.assessment_sessions
  ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'audio',
  ADD COLUMN IF NOT EXISTS audio_score numeric,
  ADD COLUMN IF NOT EXISTS video_score numeric,
  ADD COLUMN IF NOT EXISTS video_breakdown jsonb;

-- 2. Extend recordings with video metrics
ALTER TABLE public.recordings
  ADD COLUMN IF NOT EXISTS video_metrics jsonb;

-- 3. Per-paragraph results
CREATE TABLE IF NOT EXISTS public.assessment_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  assessment_id uuid NOT NULL REFERENCES public.assessment_sessions(id) ON DELETE CASCADE,
  paragraph_id uuid,
  paragraph_number smallint NOT NULL,
  mode text NOT NULL DEFAULT 'video',
  audio_score numeric,
  video_score numeric,
  overall_score numeric,
  loudness_score numeric,
  clarity_score numeric,
  fluency_score numeric,
  speaking_rate_score numeric,
  eye_contact_score numeric,
  facial_engagement_score numeric,
  facial_expressiveness_score numeric,
  head_stability_score numeric,
  face_visibility_score numeric,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, paragraph_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_results TO authenticated;
GRANT ALL ON public.assessment_results TO service_role;

ALTER TABLE public.assessment_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "assessment_results_select_own_or_admin"
  ON public.assessment_results FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "assessment_results_insert_own"
  ON public.assessment_results FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "assessment_results_update_own"
  ON public.assessment_results FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_assessment_results_updated_at ON public.assessment_results;
CREATE TRIGGER update_assessment_results_updated_at
  BEFORE UPDATE ON public.assessment_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Leaderboard with audio/video breakdown
DROP FUNCTION IF EXISTS public.get_leaderboard(integer);
CREATE OR REPLACE FUNCTION public.get_leaderboard(_limit integer DEFAULT 100)
RETURNS TABLE(
  session_id uuid, user_id uuid, full_name text, avatar_url text,
  overall_score numeric, audio_score numeric, video_score numeric,
  overall_grade text, mode text, completed_at timestamptz
)
LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT DISTINCT ON (s.user_id)
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
  FROM public.assessment_sessions s
  JOIN public.profiles p ON p.id = s.user_id
  WHERE s.status = 'completed' AND s.overall_score IS NOT NULL
  ORDER BY s.user_id, s.overall_score DESC, s.completed_at DESC
  LIMIT GREATEST(COALESCE(_limit, 100), 1);
$$;
