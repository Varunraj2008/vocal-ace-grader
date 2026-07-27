import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Nav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Vocalis" },
      { name: "description", content: "Live leaderboard of top communicators in your organization." },
      { property: "og:title", content: "Leaderboard — Vocalis" },
      { property: "og:description", content: "Live leaderboard of top communicators." },
    ],
  }),
  component: LeaderboardPage,
});

type Row = {
  session_id: string; display_name: string | null; avatar_url: string | null;
  score: number; grade: string; completed_at: string;
};

function LeaderboardPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data } = await supabase.from("leaderboard").select("*").limit(100);
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("leaderboard")
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <div className="text-center mb-8">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-brand-foreground shadow-glow">
            <Trophy className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">Ranked by highest-scoring completed assessment.</p>
        </div>

        <Card className="glass border-0">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-10 text-center text-muted-foreground">Loading…</div>
            ) : rows.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">No assessments have been completed yet.</div>
            ) : (
              <ul className="divide-y">
                {rows.map((r, i) => (
                  <li key={r.session_id} className="flex items-center gap-4 p-4">
                    <div className={`grid h-10 w-10 place-items-center rounded-full font-bold ${i === 0 ? "bg-brand-gradient text-brand-foreground shadow-glow" : i < 3 ? "bg-accent" : "border"}`}>{i + 1}</div>
                    {r.avatar_url ? <img src={r.avatar_url} alt="" className="h-9 w-9 rounded-full" /> : <div className="h-9 w-9 rounded-full bg-accent" />}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.display_name ?? "Anonymous"}</div>
                      <div className="text-xs text-muted-foreground">{new Date(r.completed_at).toLocaleDateString()} · Grade {r.grade}</div>
                    </div>
                    <div className="text-xl font-bold text-gradient">{Number(r.score).toFixed(1)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
