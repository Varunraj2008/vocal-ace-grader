
-- Disable RLS on recording-related public tables
ALTER TABLE public.recordings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transcripts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_results DISABLE ROW LEVEL SECURITY;

-- Ensure grants allow full access for signed-in users
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recordings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcripts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analysis_results TO authenticated;

-- Drop restrictive storage policies for the recordings bucket
DROP POLICY IF EXISTS recordings_upload_own ON storage.objects;
DROP POLICY IF EXISTS recordings_read_own_or_admin ON storage.objects;
DROP POLICY IF EXISTS recordings_delete_own ON storage.objects;

-- Add permissive policies so any authenticated user can access the recordings bucket
CREATE POLICY recordings_authenticated_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'recordings')
  WITH CHECK (bucket_id = 'recordings');
