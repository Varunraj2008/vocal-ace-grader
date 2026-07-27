import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles").select("role").eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!data?.some((r: { role: string }) => r.role === "admin")) throw new Error("Forbidden");
}

export const adminStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [users, sessions, completed] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("assessment_sessions").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("assessment_sessions").select("overall_score").eq("status", "completed"),
    ]);
    const scores = (completed.data ?? []).map((r) => Number(r.overall_score)).filter((n) => !Number.isNaN(n));
    return {
      totalUsers: users.count ?? 0,
      totalSessions: sessions.count ?? 0,
      completedSessions: scores.length,
      averageScore: scores.length ? +(scores.reduce((s, v) => s + v, 0) / scores.length).toFixed(2) : 0,
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
    };
  });

const ListInput = z.object({ search: z.string().optional() }).optional();

export const adminListUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("profiles").select("id, email, full_name, avatar_url, created_at").order("created_at", { ascending: false }).limit(200);
    if (data?.search) q = q.ilike("email", `%${data.search}%`);
    const { data: profiles, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (profiles ?? []).map((p) => p.id);
    const { data: sessions } = await supabaseAdmin
      .from("assessment_sessions").select("user_id, overall_score, completed_at, status").in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const byUser = new Map<string, { best: number; count: number; last: string | null }>();
    for (const s of sessions ?? []) {
      const prev = byUser.get(s.user_id) ?? { best: 0, count: 0, last: null };
      prev.count += 1;
      if (s.status === "completed" && s.overall_score != null) {
        prev.best = Math.max(prev.best, Number(s.overall_score));
        if (!prev.last || new Date(s.completed_at ?? 0) > new Date(prev.last)) prev.last = s.completed_at;
      }
      byUser.set(s.user_id, prev);
    }
    return (profiles ?? []).map((p) => ({ ...p, stats: byUser.get(p.id) ?? { best: 0, count: 0, last: null } }));
  });

const SessionInput = z.object({ sessionId: z.string().uuid() });

export const adminGetSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: session } = await supabaseAdmin.from("assessment_sessions").select("*").eq("id", data.sessionId).single();
    const { data: recs } = await supabaseAdmin.from("recordings").select("*").eq("session_id", data.sessionId).order("slot");
    const ids = (recs ?? []).map((r) => r.id);
    const { data: transcripts } = await supabaseAdmin.from("transcripts").select("*").in("recording_id", ids);
    const { data: analyses } = await supabaseAdmin.from("analysis_results").select("*").in("recording_id", ids);
    const paragraphIds = (recs ?? []).map((r) => r.paragraph_id);
    const { data: paragraphs } = await supabaseAdmin.from("paragraphs").select("*").in("id", paragraphIds);
    // Signed URLs for playback (admins)
    const signed = await Promise.all((recs ?? []).map((r) =>
      supabaseAdmin.storage.from("recordings").createSignedUrl(r.storage_path, 3600).then((s) => ({ id: r.id, url: s.data?.signedUrl }))
    ));
    return { session, recordings: recs, transcripts, analyses, paragraphs, signedUrls: signed };
  });
