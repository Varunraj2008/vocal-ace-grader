import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer } from "recharts";
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

function ResultsPage() {
  const { sessionId } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: async () => {
      const { data: session } = await supabase.from("assessment_sessions").select("*").eq("id", sessionId).single();
      const { data: recs } = await supabase.from("recordings").select("id, slot, paragraph_id").eq("session_id", sessionId).order("slot");
      const ids = (recs ?? []).map((r) => r.id);
      const { data: analyses } = await supabase.from("analysis_results").select("*").in("recording_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const { data: transcripts } = await supabase.from("transcripts").select("recording_id, text").in("recording_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
      const paragraphIds = (recs ?? []).map((r) => r.paragraph_id).filter(Boolean) as string[];
      const { data: paragraphs } = await supabase.from("paragraphs").select("*").in("id", paragraphIds.length ? paragraphIds : ["00000000-0000-0000-0000-000000000000"]);
      return { session, recs, analyses, transcripts, paragraphs };
    },
  });

  if (isLoading || !data) return (
    <main className="mx-auto max-w-4xl px-4 py-24 text-center">
      <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
      <p className="mt-4 text-muted-foreground">Loading your results…</p>
    </main>
  );

  const s = data.session as any;
  if (!s || s.status !== "completed") {
    return <main className="mx-auto max-w-4xl px-4 py-24 text-center text-muted-foreground">This session isn't ready yet.</main>;
  }

  const breakdown = s.breakdown ?? {};
  const chartData = [
    { metric: "Accuracy", score: breakdown.accuracy ?? 0 },
    { metric: "Fluency", score: breakdown.fluency ?? 0 },
    { metric: "Pronunciation", score: breakdown.pronunciation ?? 0 },
    { metric: "Clarity", score: breakdown.clarity ?? 0 },
    { metric: "Confidence", score: breakdown.confidence ?? 0 },
    { metric: "Pace", score: breakdown.pace ?? 0 },
    { metric: "Voice", score: breakdown.voiceQuality ?? 0 },
  ];

  const paraById = new Map((data.paragraphs ?? []).map((p: any) => [p.id, p]));
  const transById = new Map((data.transcripts ?? []).map((t: any) => [t.recording_id, t.text]));
  const analysisById = new Map((data.analyses ?? []).map((a: any) => [a.recording_id, a]));

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-8">
      {/* Hero score */}
      <Card className="glass border-0 overflow-hidden">
        <div className="bg-hero p-8 text-center">
          <div className="text-white/80 text-sm">Overall communication score</div>
          <div className="mt-2 text-7xl font-extrabold text-white drop-shadow">{Number(s.overall_score).toFixed(1)}</div>
          <div className="mt-1 text-white/90">Grade <span className="font-bold">{s.overall_grade}</span></div>
          <div className="mt-4 flex justify-center gap-3">
            <Button asChild variant="secondary" className="rounded-full"><Link to="/leaderboard"><Trophy className="mr-2 h-4 w-4" />See leaderboard</Link></Button>
            <Button asChild variant="secondary" className="rounded-full"><Link to="/assessment"><RotateCw className="mr-2 h-4 w-4" />Take again</Link></Button>
            <Button asChild variant="secondary" className="rounded-full"><Link to="/"><Home className="mr-2 h-4 w-4" />Home</Link></Button>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass border-0">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Breakdown</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={chartData}>
                  <PolarGrid stroke="var(--border)" />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} />
                  <Radar dataKey="score" stroke="var(--brand)" fill="var(--brand)" fillOpacity={0.35} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="font-semibold mb-2">Strengths</h3>
              <ul className="space-y-1 text-sm">
                {(s.strengths ?? []).map((x: string) => <li key={x}>✅ {x}</li>)}
              </ul>
            </div>
            {(s.weaknesses ?? []).length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Areas to improve</h3>
                <ul className="space-y-1 text-sm">
                  {(s.weaknesses ?? []).map((x: string) => <li key={x}>⚠️ {x}</li>)}
                </ul>
              </div>
            )}
            <div>
              <h3 className="font-semibold mb-2">Suggestions</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {(s.suggestions ?? []).map((x: string) => <li key={x}>💡 {x}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Per-passage detail */}
      <div className="space-y-4">
        {(data.recs ?? []).map((r: any) => {
          const p: any = paraById.get(r.paragraph_id);
          const a: any = analysisById.get(r.id);
          const t = transById.get(r.id);
          return (
            <Card key={r.id} className="glass border-0">
              <CardContent className="p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="font-semibold">Passage {r.slot}</div>
                  <div className="flex gap-2">
                    <Badge variant="secondary" className="capitalize">{p?.difficulty}</Badge>
                    <Badge variant="outline" className="capitalize">{p?.category}</Badge>
                    {a && <Badge className="bg-brand-gradient text-brand-foreground border-0">{Number(a.weighted_score).toFixed(1)}</Badge>}
                  </div>
                </div>
                <p className="text-sm">{p?.content}</p>
                {t && (
                  <div>
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Your transcript</div>
                    <p className="mt-1 text-sm italic text-muted-foreground border-l-2 pl-3">{t}</p>
                  </div>
                )}
                {a && (
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-xs">
                    <Stat label="Accuracy" v={a.accuracy} />
                    <Stat label="Fluency" v={a.fluency} />
                    <Stat label="Pron." v={a.pronunciation} />
                    <Stat label="Clarity" v={a.clarity} />
                    <Stat label="Pace" v={a.pace} />
                    <Stat label="WPM" v={a.wpm} suffix="" />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </main>
  );
}

function Stat({ label, v, suffix = "" }: { label: string; v: number | string; suffix?: string }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold">{typeof v === "number" ? v.toFixed(1) : v}{suffix}</div>
    </div>
  );
}
