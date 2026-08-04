import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";
import { AssessmentReport } from "@/components/AssessmentReport";
import { Button } from "@/components/ui/button";
import { Loader2, Trophy, RotateCw, Home } from "lucide-react";

export const Route = createFileRoute("/_authenticated/results/$sessionId")({
  head: () => ({
    meta: [
      { title: "Your results — Vocalis" },
      { name: "description", content: "Detailed communication assessment scores across seven dimensions." },
      { property: "og:title", content: "Your results — Vocalis" },
      { property: "og:description", content: "Detailed AI communication assessment scores." },
    ],
  }),
  component: ResultsPage,
});

const EMPTY = "00000000-0000-0000-0000-000000000000";

function ResultsPage() {
  const { sessionId } = Route.useParams();
  const { isAdmin, isLoading: roleLoading } = useRole();
  const navigate = useNavigate();

  // Admins never view the learner-facing results flow.
  useEffect(() => {
    if (!roleLoading && isAdmin) navigate({ to: "/admin", replace: true });
  }, [isAdmin, roleLoading, navigate]);

  const { data, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    enabled: !roleLoading && !isAdmin,
    queryFn: async () => {
      const { data: session } = await supabase.from("assessment_sessions").select("*").eq("id", sessionId).single();
      const { data: recs } = await supabase.from("recordings").select("*").eq("session_id", sessionId).order("slot");
      const ids = (recs ?? []).map((r) => r.id);
      const { data: analyses } = await supabase.from("analysis_results").select("*").in("recording_id", ids.length ? ids : [EMPTY]);
      const { data: transcripts } = await supabase.from("transcripts").select("recording_id, text").in("recording_id", ids.length ? ids : [EMPTY]);
      const paragraphIds = (recs ?? []).map((r) => r.paragraph_id).filter(Boolean) as string[];
      const { data: paragraphs } = await supabase.from("paragraphs").select("*").in("id", paragraphIds.length ? paragraphIds : [EMPTY]);
      return { session, recs: recs ?? [], analyses: analyses ?? [], transcripts: transcripts ?? [], paragraphs: paragraphs ?? [] };
    },
  });

  if (roleLoading || isAdmin || isLoading || !data) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-24 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Loading your results…</p>
      </main>
    );
  }

  const s = data.session as Record<string, any> | null;
  if (!s || s.status !== "completed") {
    return <main className="mx-auto max-w-4xl px-4 py-24 text-center text-muted-foreground">This session isn't ready yet.</main>;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <AssessmentReport
        data={{
          session: s,
          recordings: data.recs,
          transcripts: data.transcripts,
          analyses: data.analyses,
          paragraphs: data.paragraphs,
        }}
        heroActions={
          <>
            <Button asChild variant="secondary" className="rounded-full"><Link to="/leaderboard"><Trophy className="mr-2 h-4 w-4" />See leaderboard</Link></Button>
            <Button asChild variant="secondary" className="rounded-full"><Link to="/assessment"><RotateCw className="mr-2 h-4 w-4" />Take again</Link></Button>
            <Button asChild variant="secondary" className="rounded-full"><Link to="/"><Home className="mr-2 h-4 w-4" />Home</Link></Button>
          </>
        }
      />
    </main>
  );
}
