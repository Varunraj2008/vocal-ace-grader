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

const StudentInput = z.object({
  studentId: z.string().uuid(),
  sessionId: z.string().uuid().optional(),
});

const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * Full admin view of one student: profile, assessment history, org rank, and
 * the complete breakdown (recordings, transcripts, analyses, signed audio)
 * for the selected session (defaults to the best completed one).
 */
export const adminGetStudent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StudentInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: pErr } = await supabaseAdmin
      .from("profiles").select("*").eq("id", data.studentId).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!profile) throw new Error("Student not found");

    const { data: history } = await supabaseAdmin
      .from("assessment_sessions")
      .select("id, status, overall_score, overall_grade, completed_at, created_at, mode")
      .eq("user_id", data.studentId)
      .order("completed_at", { ascending: false, nullsFirst: false });

    const completed = (history ?? []).filter((h) => h.status === "completed" && h.overall_score != null);

    // Org-wide rank based on each user's best completed score.
    const { data: allCompleted } = await supabaseAdmin
      .from("assessment_sessions")
      .select("user_id, overall_score")
      .eq("status", "completed")
      .not("overall_score", "is", null);
    const bestByUser = new Map<string, number>();
    for (const row of allCompleted ?? []) {
      const score = Number(row.overall_score);
      if (!bestByUser.has(row.user_id) || score > bestByUser.get(row.user_id)!) bestByUser.set(row.user_id, score);
    }
    const ordered = [...bestByUser.entries()].sort((a, b) => b[1] - a[1]);
    const rankIndex = ordered.findIndex(([uid]) => uid === data.studentId);
    const rank = rankIndex >= 0 ? rankIndex + 1 : null;

    const selectedId =
      data.sessionId ??
      completed.slice().sort((a, b) => Number(b.overall_score) - Number(a.overall_score))[0]?.id ??
      null;

    let detail: {
      session: unknown;
      recordings: unknown[];
      transcripts: unknown[];
      analyses: unknown[];
      paragraphs: unknown[];
      signedUrls: { id: string; url: string | null }[];
    } | null = null;

    if (selectedId) {
      const { data: session } = await supabaseAdmin
        .from("assessment_sessions").select("*").eq("id", selectedId).eq("user_id", data.studentId).maybeSingle();
      if (session) {
        const { data: recs } = await supabaseAdmin
          .from("recordings").select("*").eq("session_id", selectedId).order("slot");
        const ids = (recs ?? []).map((r) => r.id);
        const paragraphIds = (recs ?? []).map((r) => r.paragraph_id).filter(Boolean);
        const [transcripts, analyses, paragraphs] = await Promise.all([
          supabaseAdmin.from("transcripts").select("*").in("recording_id", ids.length ? ids : [EMPTY_UUID]),
          supabaseAdmin.from("analysis_results").select("*").in("recording_id", ids.length ? ids : [EMPTY_UUID]),
          supabaseAdmin.from("paragraphs").select("*").in("id", paragraphIds.length ? paragraphIds : [EMPTY_UUID]),
        ]);
        const signedUrls = await Promise.all(
          (recs ?? []).map(async (r) => {
            const { data: signed } = await supabaseAdmin.storage
              .from("recordings").createSignedUrl(r.storage_path, 3600);
            return { id: r.id, url: signed?.signedUrl ?? null };
          }),
        );
        detail = {
          session,
          recordings: recs ?? [],
          transcripts: transcripts.data ?? [],
          analyses: analyses.data ?? [],
          paragraphs: paragraphs.data ?? [],
          signedUrls,
        };
      }
    }

    return { profile, history: history ?? [], rank, totalRanked: ordered.length, selectedId, detail };
  });

/** Hard-deletes one assessment (audio, transcripts, analyses, recordings, session). */
export const adminDeleteSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SessionInput.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: recs } = await supabaseAdmin
      .from("recordings").select("id, storage_path").eq("session_id", data.sessionId);
    const ids = (recs ?? []).map((r) => r.id);
    const paths = (recs ?? []).map((r) => r.storage_path).filter(Boolean);

    if (paths.length) await supabaseAdmin.storage.from("recordings").remove(paths);
    if (ids.length) {
      await supabaseAdmin.from("transcripts").delete().in("recording_id", ids);
      await supabaseAdmin.from("analysis_results").delete().in("recording_id", ids);
      await supabaseAdmin.from("recordings").delete().in("id", ids);
    }
    await supabaseAdmin.from("assessment_results").delete().eq("assessment_id", data.sessionId);
    const { error } = await supabaseAdmin.from("assessment_sessions").delete().eq("id", data.sessionId);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("admin_logs").insert({
      admin_id: context.userId,
      action: "delete_assessment",
      target: data.sessionId,
      metadata: { recordings: ids.length },
    });

    return { ok: true, deletedRecordings: ids.length };
  });

