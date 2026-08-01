import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { startAssessment, submitRecording, finalizeAssessment } from "@/lib/assessment.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { startRecorder, type Recorder } from "@/lib/audio";
import { toast } from "sonner";
import { Mic, Square, RotateCcw, ChevronRight, CheckCircle2, Loader2, PlayCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assessment")({
  head: () => ({
    meta: [
      { title: "Assessment — Vocalis" },
      { name: "description", content: "Record three paragraphs and get instantly scored on communication skills." },
      { property: "og:title", content: "Assessment — Vocalis" },
      { property: "og:description", content: "Record three paragraphs and get instantly scored." },
    ],
  }),
  component: AssessmentPage,
});

type Para = { id: string; category: string; difficulty: string; content: string };
type SlotState = {
  status: "idle" | "recording" | "processing" | "done" | "error";
  transcript?: string;
  score?: number;
  storagePath?: string;
  audioUrl?: string;
  error?: string;
};

function AssessmentPage() {
  const navigate = useNavigate();
  const start = useServerFn(startAssessment);
  const submit = useServerFn(submitRecording);
  const finalize = useServerFn(finalizeAssessment);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [paragraphs, setParagraphs] = useState<Para[]>([]);
  const [current, setCurrent] = useState(0);
  const [slots, setSlots] = useState<SlotState[]>([]);
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<Recorder | null>(null);
  const rafRef = useRef<number>(0);

  const begin = async () => {
    setStarting(true);
    try {
      const res = await start({ data: {} });
      setSessionId(res.sessionId);
      setParagraphs(res.paragraphs as Para[]);
      setSlots(res.paragraphs.map(() => ({ status: "idle" })) as SlotState[]);
      setCurrent(0);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to start"); }
    finally { setStarting(false); }
  };

  const startRec = async () => {
    try {
      const r = await startRecorder();
      recorderRef.current = r;
      r.onLevel((rms) => setLevel(rms));
      setElapsed(0);
      const tick = () => {
        setElapsed(recorderRef.current?.getElapsed() ?? 0);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      updateSlot(current, { status: "recording" });
    } catch (e) {
      toast.error("Microphone access denied");
      console.error(e);
    }
  };

  const stopRec = async () => {
    const r = recorderRef.current; if (!r) return;
    cancelAnimationFrame(rafRef.current);
    updateSlot(current, { status: "processing" });
    try {
      const { blob, metrics } = await r.stop();
      recorderRef.current = null;
      setLevel(0);
      if (blob.size < 4096 || metrics.durationSeconds < 3) {
        toast.error("Recording too short — please read the full paragraph.");
        updateSlot(current, { status: "idle" });
        return;
      }
      // Upload to storage
      const { data: sessionRes } = await supabase.auth.getSession();
      let uid = sessionRes.session?.user?.id ?? null;
      if (!uid) {
        const { data: userRes } = await supabase.auth.getUser();
        uid = userRes?.user?.id ?? null;
      }
      if (!uid) throw new Error("Your session expired — please sign in again.");
      const path = `${uid}/${sessionId}/slot-${current + 1}.wav`;
      const up = await supabase.storage.from("recordings").upload(path, blob, { contentType: "audio/wav", upsert: true });
      if (up.error) throw new Error(up.error.message);
      // Local preview URL
      const audioUrl = URL.createObjectURL(blob);
      // Submit to server for transcription + scoring
      const res = await submit({
        data: {
          sessionId: sessionId!, slot: current + 1, paragraphId: paragraphs[current].id,
          storagePath: path,
          metrics: {
            durationSeconds: metrics.durationSeconds, avgVolume: metrics.avgVolume,
            peakVolume: metrics.peakVolume, silenceRatio: metrics.silenceRatio, clipping: metrics.clipping,
          },
        },
      });
      updateSlot(current, { status: "done", transcript: res.transcript, score: res.score.weighted, storagePath: path, audioUrl });
      toast.success(`Slot ${current + 1} scored: ${res.score.weighted.toFixed(1)}`);
    } catch (e) {
      updateSlot(current, { status: "error", error: e instanceof Error ? e.message : "Failed" });
      toast.error(e instanceof Error ? e.message : "Failed to process recording");
    }
  };

  const updateSlot = (i: number, patch: Partial<SlotState>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const rerecord = () => updateSlot(current, { status: "idle", transcript: undefined, score: undefined, audioUrl: undefined });

  const allDone = slots.length === 3 && slots.every((s) => s.status === "done");

  const submitAll = async () => {
    if (!sessionId) return;
    setFinalizing(true);
    try {
      await finalize({ data: { sessionId } });
      navigate({ to: "/results/$sessionId", params: { sessionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Finalize failed");
      setFinalizing(false);
    }
  };

  useEffect(() => () => { recorderRef.current?.cancel(); cancelAnimationFrame(rafRef.current); }, []);

  if (!sessionId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-14">
        <Card className="glass border-0">
          <CardHeader>
            <CardTitle className="text-2xl">Ready for your assessment?</CardTitle>
            <CardDescription>
              You will read three passages aloud — easy, medium, and hard. Total time: about 5 minutes.
              Make sure you are in a quiet room with a working microphone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>Read each paragraph clearly at a natural pace (about 140 wpm).</li>
              <li>You can re-record any slot before final submission.</li>
              <li>Scoring is instant and updates the org leaderboard.</li>
            </ul>
            <Button onClick={begin} disabled={starting} size="lg" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow px-6 h-12">
              {starting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing…</> : <><PlayCircle className="mr-2 h-5 w-5" />Begin assessment</>}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const p = paragraphs[current];
  const slot = slots[current];

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      {/* Progress rail */}
      <div className="flex items-center gap-3">
        {slots.map((s, i) => (
          <button
            key={i}
            onClick={() => s.status !== "recording" && s.status !== "processing" && setCurrent(i)}
            className={`flex-1 h-2 rounded-full transition ${
              i === current ? "bg-brand-gradient" : s.status === "done" ? "bg-success" : "bg-accent"
            }`}
            aria-label={`Go to slot ${i + 1}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Passage {current + 1} of {paragraphs.length}</span>
        <div className="flex gap-2">
          <Badge variant="secondary" className="capitalize">{p.difficulty}</Badge>
          <Badge variant="outline" className="capitalize">{p.category}</Badge>
        </div>
      </div>

      <Card className="glass border-0">
        <CardContent className="p-8">
          <p className="text-xl leading-relaxed font-medium tracking-[-0.01em]">{p.content}</p>
          <div className="mt-3 text-xs text-muted-foreground">{p.content.trim().split(/\s+/).length} words</div>
        </CardContent>
      </Card>

      {/* Recorder */}
      <Card className="glass border-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              {slot.status === "idle" && "Ready to record"}
              {slot.status === "recording" && <span className="text-destructive">● Recording…</span>}
              {slot.status === "processing" && <span>Transcribing & scoring…</span>}
              {slot.status === "done" && <span className="text-success">✓ Scored: {slot.score?.toFixed(1)}</span>}
              {slot.status === "error" && <span className="text-destructive">Error: {slot.error}</span>}
            </div>
            <div className="text-sm tabular-nums text-muted-foreground">{formatTime(elapsed)}</div>
          </div>

          <LevelBar level={level} active={slot.status === "recording"} />

          <div className="mt-6 flex flex-wrap gap-3">
            {slot.status === "idle" && (
              <Button onClick={startRec} size="lg" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow px-6">
                <Mic className="mr-2 h-5 w-5" />Start recording
              </Button>
            )}
            {slot.status === "recording" && (
              <Button onClick={stopRec} size="lg" variant="destructive" className="rounded-full px-6">
                <Square className="mr-2 h-4 w-4" />Stop & submit
              </Button>
            )}
            {slot.status === "processing" && (
              <Button disabled size="lg" className="rounded-full px-6"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Working…</Button>
            )}
            {slot.status === "done" && (
              <>
                <Button onClick={rerecord} variant="outline" className="rounded-full"><RotateCcw className="mr-2 h-4 w-4" />Re-record</Button>
                {slot.audioUrl && <audio src={slot.audioUrl} controls className="ml-2 h-10" />}
                {current < paragraphs.length - 1 && (
                  <Button onClick={() => setCurrent(current + 1)} className="rounded-full ml-auto">
                    Next passage <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                )}
              </>
            )}
            {slot.status === "error" && (
              <Button onClick={rerecord} variant="outline" className="rounded-full"><RotateCcw className="mr-2 h-4 w-4" />Try again</Button>
            )}
          </div>

          {slot.status === "done" && slot.transcript && (
            <div className="mt-6">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Transcript</div>
              <p className="mt-2 text-sm text-muted-foreground italic border-l-2 pl-3">{slot.transcript}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {allDone && (
        <div className="flex items-center justify-between glass rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <div>
              <div className="font-semibold">All three passages recorded.</div>
              <div className="text-sm text-muted-foreground">Submit to see your overall score and ranking.</div>
            </div>
          </div>
          <Button onClick={submitAll} disabled={finalizing} size="lg" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow px-6">
            {finalizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scoring…</> : <>See results <ChevronRight className="ml-1 h-4 w-4" /></>}
          </Button>
        </div>
      )}
    </main>
  );
}

function LevelBar({ level, active }: { level: number; active: boolean }) {
  const pct = Math.min(100, Math.round(level * 300));
  return (
    <div className="mt-4">
      <Progress value={active ? pct : 0} className="h-2" />
    </div>
  );
}

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
