create extension if not exists pgcrypto;

create type public.app_role as enum ('user','admin');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select on public.profiles to anon;
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles_select_all" on public.profiles for select to anon, authenticated using (true);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "profiles_insert_own"  on public.profiles for insert to authenticated with check (auth.uid() = id);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create policy "user_roles_select_own_or_admin" on public.user_roles for select to authenticated using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.profiles(id,email,full_name,avatar_url)
    values(new.id, new.email,
           coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
           new.raw_user_meta_data->>'avatar_url')
    on conflict (id) do nothing;
  insert into public.user_roles(user_id, role) values(new.id,'user') on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.paragraphs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  difficulty text not null check (difficulty in ('easy','medium','hard')),
  content text not null,
  word_count int generated always as (array_length(regexp_split_to_array(trim(content),E'\\s+'),1)) stored,
  created_at timestamptz not null default now()
);
create index paragraphs_difficulty_idx on public.paragraphs(difficulty);
create index paragraphs_category_idx on public.paragraphs(category);
grant select on public.paragraphs to anon, authenticated;
grant all on public.paragraphs to service_role;
alter table public.paragraphs enable row level security;
create policy "paragraphs_read_all" on public.paragraphs for select to anon, authenticated using (true);

create table public.assessment_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress','completed','abandoned')),
  paragraph_easy_id uuid references public.paragraphs(id),
  paragraph_medium_id uuid references public.paragraphs(id),
  paragraph_hard_id uuid references public.paragraphs(id),
  overall_score numeric,
  overall_grade text,
  breakdown jsonb,
  strengths jsonb,
  weaknesses jsonb,
  suggestions jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index sessions_user_idx on public.assessment_sessions(user_id);
create index sessions_score_idx on public.assessment_sessions(overall_score desc);
grant select, insert, update on public.assessment_sessions to authenticated;
grant select on public.assessment_sessions to anon;
grant all on public.assessment_sessions to service_role;
alter table public.assessment_sessions enable row level security;
create policy "sessions_select_own_or_admin" on public.assessment_sessions for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "sessions_select_completed_public" on public.assessment_sessions for select to anon, authenticated
  using (status = 'completed');
create policy "sessions_insert_own" on public.assessment_sessions for insert to authenticated with check (user_id = auth.uid());
create policy "sessions_update_own_or_admin" on public.assessment_sessions for update to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid() or public.has_role(auth.uid(),'admin'));

create table public.recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.assessment_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  paragraph_id uuid not null references public.paragraphs(id),
  slot smallint not null check (slot in (1,2,3)),
  storage_path text not null,
  duration_seconds numeric,
  client_metrics jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, slot)
);
create index recordings_session_idx on public.recordings(session_id);
grant select, insert, update, delete on public.recordings to authenticated;
grant all on public.recordings to service_role;
alter table public.recordings enable row level security;
create policy "recordings_owner_or_admin" on public.recordings for all to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(),'admin'))
  with check (user_id = auth.uid());

create table public.transcripts (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references public.recordings(id) on delete cascade,
  text text not null,
  raw jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.transcripts to authenticated;
grant all on public.transcripts to service_role;
alter table public.transcripts enable row level security;
create policy "transcripts_owner_or_admin" on public.transcripts for select to authenticated
  using (exists(select 1 from public.recordings r where r.id=recording_id and (r.user_id=auth.uid() or public.has_role(auth.uid(),'admin'))));
create policy "transcripts_insert_owner" on public.transcripts for insert to authenticated
  with check (exists(select 1 from public.recordings r where r.id=recording_id and r.user_id=auth.uid()));

create table public.analysis_results (
  id uuid primary key default gen_random_uuid(),
  recording_id uuid not null unique references public.recordings(id) on delete cascade,
  accuracy numeric, fluency numeric, pronunciation numeric, clarity numeric, confidence numeric, pace numeric, voice_quality numeric,
  wer numeric, cer numeric, wpm numeric, silence_ratio numeric, avg_volume numeric, peak_volume numeric,
  weighted_score numeric,
  details jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.analysis_results to authenticated;
grant all on public.analysis_results to service_role;
alter table public.analysis_results enable row level security;
create policy "analysis_owner_or_admin" on public.analysis_results for select to authenticated
  using (exists(select 1 from public.recordings r where r.id=recording_id and (r.user_id=auth.uid() or public.has_role(auth.uid(),'admin'))));
create policy "analysis_insert_owner" on public.analysis_results for insert to authenticated
  with check (exists(select 1 from public.recordings r where r.id=recording_id and r.user_id=auth.uid()));

create table public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.admin_logs to authenticated;
grant all on public.admin_logs to service_role;
alter table public.admin_logs enable row level security;
create policy "admin_logs_admin_only" on public.admin_logs for select to authenticated using (public.has_role(auth.uid(),'admin'));
create policy "admin_logs_admin_insert" on public.admin_logs for insert to authenticated with check (public.has_role(auth.uid(),'admin') and admin_id = auth.uid());

create or replace view public.leaderboard as
select distinct on (s.user_id)
  s.user_id,
  p.full_name,
  p.avatar_url,
  s.id as session_id,
  s.overall_score,
  s.overall_grade,
  s.breakdown,
  s.completed_at
from public.assessment_sessions s
join public.profiles p on p.id = s.user_id
where s.status='completed' and s.overall_score is not null
order by s.user_id, s.overall_score desc, s.completed_at desc;
grant select on public.leaderboard to anon, authenticated;

create policy "recordings_upload_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "recordings_read_own_or_admin" on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and ((storage.foldername(name))[1] = auth.uid()::text or public.has_role(auth.uid(),'admin')));
create policy "recordings_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text);

alter publication supabase_realtime add table public.assessment_sessions;
