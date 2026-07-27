drop view if exists public.leaderboard;
create view public.leaderboard
with (security_invoker=true) as
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

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;