import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";
import { Download, FileText, Braces } from "lucide-react";
import { diffWords, diffSummary } from "@/lib/diff";

/* ---------------------------------- types --------------------------------- */

export type ReportPayload = {
  session: Record<string, any> | null;
  recordings: Record<string, any>[];
  transcripts: Record<string, any>[];
  analyses: Record<string, any>[];
  paragraphs: Record<string, any>[];
  audioUrls?: { id: string; url?: string | null }[];
};

type Props = {
  data: ReportPayload;
  /** Enables audio download + transcript/JSON export controls. */
  admin?: boolean;
  /** Rendered inside the hero card, under the grade. */
  heroActions?: React.ReactNode;
  studentName?: string;
};

const num = (v: unknown, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const clamp = (v: number) => Math.max(0, Math.min(100, v));

/* --------------------------------- report --------------------------------- */

export function AssessmentReport({ data, admin = false, heroActions, studentName }: Props) {
  const s = data.session ?? {};
  const breakdown = (s.breakdown ?? {}) as Record<string, number>;

  const paraById = useMemo(
    () => new Map((data.paragraphs ?? []).map((p) => [p.id, p])),
    [data.paragraphs],
  );
  const transById = useMemo(
    () => new Map((data.transcripts ?? []).map((t) => [t.recording_id, t.text as string])),
    [data.transcripts],
  );
  const analysisById = useMemo(
    () => new Map((data.analyses ?? []).map((a) => [a.recording_id, a])),
    [data.analyses],
  );
  const audioById = useMemo(
    () => new Map((data.audioUrls ?? []).map((a) => [a.id, a.url ?? null])),
    [data.audioUrls],
  );

  const chartData = [
    { metric: "Accuracy", score: num(breakdown.accuracy) },
    { metric: "Fluency", score: num(breakdown.fluency) },
    { metric: "Pronunciation", score: num(breakdown.pronunciation) },
    { metric: "Clarity", score: num(breakdown.clarity) },
    { metric: "Confidence", score: num(breakdown.confidence) },
    { metric: "Pace", score: num(breakdown.pace) },
    { metric: "Voice", score: num(breakdown.voiceQuality) },
  ];

  // Derived acoustic metrics averaged across the session's recordings.
  const acoustic = useMemo(() => {
    const list = data.analyses ?? [];
    if (!list.length) return { silence: 0, avgVol: 0, peakVol: 0, wpm: num(breakdown.wpm) };
    const avg = (k: string) => list.reduce((t, a) => t + num(a[k]), 0) / list.length;
    return { silence: avg("silence_ratio"), avgVol: avg("avg_volume"), peakVol: avg("peak_volume"), wpm: avg("wpm") };
  }, [data.analyses, breakdown.wpm]);

  const metrics = [
    { label: "Reading accuracy", value: num(breakdown.accuracy), suffix: "" },
    { label: "Fluency", value: num(breakdown.fluency), suffix: "" },
    { label: "Pronunciation", value: num(breakdown.pronunciation), suffix: "" },
    { label: "Clarity", value: num(breakdown.clarity), suffix: "" },
    { label: "Confidence", value: num(breakdown.confidence), suffix: "" },
    { label: "Voice quality", value: num(breakdown.voiceQuality), suffix: "" },
    { label: "Pace", value: num(breakdown.pace), suffix: "" },
    { label: "Pitch stability", value: clamp(Math.round(num(breakdown.voiceQuality) * 0.7 + num(breakdown.clarity) * 0.3)), suffix: "" },
    { label: "Background noise control", value: clamp(Math.round(100 - acoustic.silence * 60 - Math.max(0, acoustic.peakVol - 0.9) * 150)), suffix: "" },
  ];

  const rawStats = [
    { label: "Words per minute", value: acoustic.wpm.toFixed(0) },
    { label: "Speech rate", value: `${(acoustic.wpm / 60).toFixed(1)} w/s` },
    { label: "Pause frequency", value: `${(acoustic.silence * 100).toFixed(0)}% silent` },
    { label: "Word error rate", value: `${(num(breakdown.wer) * 100).toFixed(1)}%` },
    { label: "Char error rate", value: `${(num(breakdown.cer) * 100).toFixed(1)}%` },
    { label: "Avg input level", value: acoustic.avgVol.toFixed(3) },
  ];

  const passages = (data.recordings ?? []).map((r) => {
    const p = paraById.get(r.paragraph_id);
    const a = analysisById.get(r.id);
    const t = transById.get(r.id) ?? "";
    const tokens = p?.content ? diffWords(p.content, t) : [];
    return { r, p, a, t, tokens, summary: diffSummary(tokens) };
  });

  const comparison = passages.map((x) => ({
    name: `P${x.r.slot}`,
    Accuracy: num(x.a?.accuracy),
    Fluency: num(x.a?.fluency),
    Overall: num(x.a?.weighted_score),
  }));

  /* ------------------------------- downloads ------------------------------- */

  const download = (filename: string, content: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadTranscript = () => {
    const body = passages
      .map((x) => `PASSAGE ${x.r.slot} — ${x.p?.category ?? ""} / ${x.p?.difficulty ?? ""}\n\nORIGINAL:\n${x.p?.content ?? ""}\n\nTRANSCRIPT:\n${x.t}\n`)
      .join("\n----------------------------------------\n\n");
    download(`transcript-${s.id}.txt`, `${studentName ?? "Assessment"} — transcript\n\n${body}`, "text/plain");
  };

  const downloadJson = () =>
    download(`assessment-${s.id}.json`, JSON.stringify({ session: s, passages: passages.map((x) => ({ slot: x.r.slot, paragraph: x.p, transcript: x.t, analysis: x.a })) }, null, 2), "application/json");

  return (
    <div className="space-y-8">
      {/* Hero */}
      <Card className="glass border-0 overflow-hidden">
        <div className="bg-hero p-8 text-center">
          <div className="text-white/80 text-sm">Overall communication score</div>
          <div className="mt-2 text-7xl font-extrabold text-white drop-shadow">{num(s.overall_score).toFixed(1)}</div>
          <div className="mt-1 text-white/90">Grade <span className="font-bold">{s.overall_grade ?? "—"}</span></div>
          {heroActions && <div className="mt-4 flex flex-wrap justify-center gap-3">{heroActions}</div>}
        </div>
      </Card>

      {admin && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button variant="outline" className="rounded-full" onClick={() => window.print()}>
            <Download className="mr-2 h-4 w-4" />Download PDF report
          </Button>
          <Button variant="outline" className="rounded-full" onClick={downloadTranscript}>
            <FileText className="mr-2 h-4 w-4" />Download transcript
          </Button>
          <Button variant="outline" className="rounded-full" onClick={downloadJson}>
            <Braces className="mr-2 h-4 w-4" />Download score JSON
          </Button>
        </div>
      )}

      {/* Radar + narrative */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="glass border-0">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Skill breakdown</h3>
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
              <h3 className="font-semibold mb-2">Improvement suggestions</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {(s.suggestions ?? []).map((x: string) => <li key={x}>💡 {x}</li>)}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Communication metrics */}
      <Card className="glass border-0">
        <CardContent className="p-6">
          <h3 className="font-semibold mb-4">Communication metrics</h3>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {metrics.map((m) => (
              <div key={m.label}>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-muted-foreground">{m.label}</span>
                  <span className="font-semibold tabular-nums">{m.value.toFixed(1)}</span>
                </div>
                <Progress value={clamp(m.value)} className="mt-1.5 h-2" />
              </div>
            ))}
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {rawStats.map((x) => (
              <div key={x.label} className="rounded-xl border p-3 text-center">
                <div className="text-[11px] text-muted-foreground">{x.label}</div>
                <div className="mt-0.5 font-semibold tabular-nums">{x.value}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Passage comparison */}
      {comparison.length > 1 && (
        <Card className="glass border-0">
          <CardContent className="p-6">
            <h3 className="font-semibold mb-4">Passage comparison</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={comparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)" }} />
                  <Bar dataKey="Accuracy" fill="var(--brand)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Fluency" fill="var(--brand-2, var(--primary))" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Overall" fill="var(--muted-foreground)" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Passages */}
      <div className="space-y-4">
        <h3 className="font-semibold">Passage details</h3>
        {passages.map(({ r, p, a, t, tokens, summary }) => {
          const audio = audioById.get(r.id);
          const duration = num(r.duration_seconds ?? a?.details?.durationSeconds);
          return (
            <Card key={r.id} className="glass border-0">
              <CardContent className="p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold">Passage {r.slot}</div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="capitalize">{p?.difficulty ?? "—"}</Badge>
                    <Badge variant="outline" className="capitalize">{p?.category ?? "—"}</Badge>
                    {a && <Badge className="bg-brand-gradient text-brand-foreground border-0">{num(a.weighted_score).toFixed(1)}</Badge>}
                  </div>
                </div>

                <div>
                  <SectionLabel>Original paragraph — errors highlighted</SectionLabel>
                  <p className="mt-1.5 text-sm leading-relaxed">
                    {tokens.length
                      ? tokens.map((tok, i) => (
                          <span
                            key={i}
                            className={
                              tok.kind === "wrong"
                                ? "rounded bg-destructive/15 px-0.5 text-destructive underline decoration-dotted"
                                : tok.kind === "missing"
                                  ? "rounded bg-warning/15 px-0.5 text-muted-foreground line-through"
                                  : tok.kind === "extra"
                                    ? "rounded bg-accent px-0.5 text-muted-foreground italic"
                                    : ""
                            }
                          >
                            {tok.text}{" "}
                          </span>
                        ))
                      : p?.content}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>● {summary.matched} correct</span>
                    <span className="text-destructive">● {summary.wrong} misread</span>
                    <span>● {summary.missing} skipped</span>
                    <span>● {summary.extra} added</span>
                  </div>
                </div>

                {t && (
                  <div>
                    <SectionLabel>AI transcript</SectionLabel>
                    <p className="mt-1.5 text-sm italic text-muted-foreground border-l-2 pl-3">{t}</p>
                  </div>
                )}

                {audio && (
                  <div className="flex flex-wrap items-center gap-3 print:hidden">
                    <audio src={audio} controls preload="metadata" className="h-10 w-full max-w-md" />
                    <span className="text-xs text-muted-foreground tabular-nums">{formatDuration(duration)}</span>
                    {admin && (
                      <Button asChild size="sm" variant="outline" className="rounded-full">
                        <a href={audio} download={`passage-${r.slot}.wav`}>
                          <Download className="mr-2 h-4 w-4" />Audio
                        </a>
                      </Button>
                    )}
                  </div>
                )}

                {a && (
                  <div className="grid grid-cols-3 gap-2 text-xs sm:grid-cols-6 lg:grid-cols-10">
                    <Stat label="Accuracy" v={num(a.accuracy)} />
                    <Stat label="Fluency" v={num(a.fluency)} />
                    <Stat label="Pron." v={num(a.pronunciation)} />
                    <Stat label="Clarity" v={num(a.clarity)} />
                    <Stat label="Confidence" v={num(a.confidence)} />
                    <Stat label="Pace" v={num(a.pace)} />
                    <Stat label="Voice" v={num(a.voice_quality)} />
                    <Stat label="Overall" v={num(a.weighted_score)} />
                    <Stat label="WPM" v={num(a.wpm)} />
                    <Stat label="Complete" v={summary.completion} suffix="%" />
                  </div>
                )}

                <div className="text-[11px] text-muted-foreground">
                  Reading time {formatDuration(duration)} · {p?.word_count ?? p?.content?.trim().split(/\s+/).length ?? 0} words
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}

function Stat({ label, v, suffix = "" }: { label: string; v: number; suffix?: string }) {
  return (
    <div className="rounded-lg border p-2 text-center">
      <div className="text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-semibold tabular-nums">{suffix === "%" ? v.toFixed(0) : v.toFixed(1)}{suffix}</div>
    </div>
  );
}

export function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
