import { createFileRoute, Link } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Mic2, Trophy, BarChart3, Sparkles, ShieldCheck, Zap } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vocalis — AI-powered communication assessment" },
      { name: "description", content: "Discover top communicators with a rigorous AI reading assessment. Record three paragraphs, get a strict score, and compete on the leaderboard." },
      { property: "og:title", content: "Vocalis — AI-powered communication assessment" },
      { property: "og:description", content: "Rigorous AI reading assessment: record, get scored, compete." },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { data: top } = useQuery({
    queryKey: ["leaderboard", "top5"],
    queryFn: async () => {
      const { data } = await supabase.from("leaderboard").select("*").limit(5);
      return data ?? [];
    },
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-hero opacity-[0.12]" />
        <div className="absolute inset-0 -z-10 [background:radial-gradient(ellipse_at_top,rgba(120,90,255,0.20),transparent_60%)]" />
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground glass">
            <Sparkles className="h-3.5 w-3.5" /> Powered by Lovable AI Whisper transcription
          </div>
          <h1 className="mt-6 text-4xl sm:text-6xl font-extrabold tracking-tight">
            Find people who <span className="text-gradient">communicate</span> exceptionally well.
          </h1>
          <p className="mt-6 max-w-2xl mx-auto text-lg text-muted-foreground">
            Vocalis is a rigorous, AI-graded reading assessment for organizations.
            Candidates record three paragraphs across three difficulty levels.
            We measure accuracy, fluency, pronunciation, clarity, confidence, pace, and voice quality — then rank them.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="h-12 rounded-full bg-brand-gradient text-brand-foreground shadow-glow hover:opacity-90 px-6">
              <Link to="/assessment"><Mic2 className="mr-2 h-5 w-5" />Start assessment</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 rounded-full px-6">
              <Link to="/leaderboard"><Trophy className="mr-2 h-5 w-5" />See leaderboard</Link>
            </Button>
          </div>

          {/* Stat strip */}
          <div className="mt-16 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {[
              { label: "Paragraphs", value: "300" },
              { label: "Categories", value: "8" },
              { label: "Difficulty tiers", value: "3" },
              { label: "Metrics per session", value: "7" },
            ].map((s) => (
              <div key={s.label} className="glass rounded-2xl p-4">
                <div className="text-2xl font-bold text-gradient">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold">Built for organizations that value clear communicators</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Every submission is transcribed, compared to the original passage, and scored on seven dimensions.
          </p>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="glass border-0">
              <CardContent className="p-6">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-gradient text-brand-foreground shadow-glow">
                  {f.icon}
                </div>
                <h3 className="mt-4 font-semibold text-lg">{f.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-accent/40">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <h2 className="text-3xl font-bold text-center">How the assessment works</h2>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {steps.map((s, i) => (
              <li key={s.title} className="glass rounded-2xl p-6">
                <div className="text-xs font-semibold text-muted-foreground">STEP {i + 1}</div>
                <h3 className="mt-2 text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{s.desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Top 5 preview */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-end justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold">Top communicators</h2>
            <p className="text-sm text-muted-foreground">Live rankings from the last 30 days.</p>
          </div>
          <Button asChild variant="ghost" size="sm"><Link to="/leaderboard">View all →</Link></Button>
        </div>
        <Card className="glass border-0">
          <CardContent className="p-0">
            {(!top || top.length === 0) ? (
              <p className="p-8 text-center text-sm text-muted-foreground">No completed assessments yet. Be the first!</p>
            ) : (
              <ul className="divide-y">
                {top.map((row: any, i: number) => (
                  <li key={row.session_id} className="flex items-center gap-4 p-4">
                    <div className={`grid h-9 w-9 place-items-center rounded-full font-bold ${i === 0 ? "bg-brand-gradient text-brand-foreground" : "bg-accent"}`}>{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{row.full_name ?? "Anonymous"}</div>
                      <div className="text-xs text-muted-foreground">Grade {row.overall_grade}</div>
                    </div>
                    <div className="text-lg font-bold text-gradient">{Number(row.overall_score).toFixed(1)}</div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>

      <footer className="border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-muted-foreground flex justify-between">
          <span>© {new Date().getFullYear()} Vocalis</span>
          <span>AI reading assessment</span>
        </div>
      </footer>
    </div>
  );
}

const features = [
  { icon: <Mic2 className="h-5 w-5" />, title: "3 paragraphs. 3 difficulties.", desc: "Each session serves easy, medium, and hard passages randomly drawn from 300 curated texts across 8 categories." },
  { icon: <BarChart3 className="h-5 w-5" />, title: "7 rigorous metrics", desc: "Accuracy, fluency, pronunciation, clarity, confidence, pace, and voice quality — weighted into one overall score." },
  { icon: <Trophy className="h-5 w-5" />, title: "Real-time leaderboard", desc: "Organization-wide ranking updates live as candidates complete assessments." },
  { icon: <ShieldCheck className="h-5 w-5" />, title: "Secure & private", desc: "Audio stored privately per user. Row-level security enforces access. Only admins can review recordings." },
  { icon: <Zap className="h-5 w-5" />, title: "Instant scoring", desc: "Whisper-grade transcription plus deterministic scoring produces results seconds after you finish speaking." },
  { icon: <Sparkles className="h-5 w-5" />, title: "Admin dashboard", desc: "Review users, sessions, transcripts, and audio. Track average and top scores across your org." },
];

const steps = [
  { title: "Sign in with Google", desc: "One click. We never store passwords." },
  { title: "Record three passages", desc: "Read each paragraph aloud when the timer starts. Re-record any slot before submitting." },
  { title: "Get scored instantly", desc: "AI transcribes, compares, and scores your reading in seconds. See your ranking on the leaderboard." },
];
