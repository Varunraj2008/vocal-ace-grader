import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScoreRing, MetricBar } from "@/components/ScoreRing";
import { startAssessment, submitRecording, finalizeAssessment } from "@/lib/assessment.functions";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { startRecorder, type Recorder } from "@/lib/audio";
import { createFaceAnalyzer, type FaceAnalyzer, type LiveStatus } from "@/lib/faceAnalysis";
import { SCORE_WEIGHTS } from "@/lib/videoScoring";
import { toast } from "sonner";
import {
  Video, Square, Loader2, CheckCircle2, ChevronRight, AlertTriangle, ShieldCheck, Camera,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/video-assessment")({
  head: () => ({
    meta: [
      { title: "Video Assessment — Vocalis" },
      { name: "description", content: "Read three passages on camera and get scored on speech plus eye contact, facial engagement and head stability." },
      { property: "og:title", content: "Video Assessment — Vocalis" },
      { property: "og:description", content: "Camera-based communication assessment with instant audio and facial analysis." },
    ],
  }),
  component: VideoAssessmentPage,
});

type Para = { id: string; category: string; difficulty: string; content: string };
type SlotResult = {
  audio: number;
  video: number | null;
  overall: number;
  transcript: string;
  metrics: Record<string, number> | null;
  feedback: Record<string, string> | null;
  warnings: string[];
  suggestions: string[];
};
type SlotState = { status: "idle" | "recording" | "processing" | "done" | "error"; result?: SlotResult; error?: string };

function VideoAssessmentPage() {
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
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyzerRef = useRef<FaceAnalyzer | null>(null);
  const recorderRef = useRef<Recorder | null>(null);
  const rafRef = useRef<number>(0);

  const teardown = useCallback(() => {
    recorderRef.current?.cancel();
    recorderRef.current = null;
    analyzerRef.current?.dispose();
    analyzerRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => teardown, [teardown]);

  const begin = async () => {
    setStarting(true);
    setCamError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (e) {
      const err = e as DOMException;
      setStarting(false);
      setCamError(
        err?.name === "NotAllowedError" || err?.name === "SecurityError"
          ? "Camera and microphone permission is required for video assessment."
          : err?.name === "NotFoundError"
            ? "No camera was found. Connect a camera and try again."
            : "Unable to access your camera. Check browser permissions and try again.",
      );
      return;
    }
    if (!stream.getAudioTracks().length) {
      stream.getTracks().forEach((t) => t.stop());
      setStarting(false);
      setCamError("Microphone permission is required for communication assessment.");
      return;
    }
    streamRef.current = stream;

    try {
      const res = await start({ data: { mode: "video" } });
      setSessionId(res.sessionId);
      setParagraphs(res.paragraphs as Para[]);
      setSlots(res.paragraphs.map(() => ({ status: "idle" })) as SlotState[]);
      setCurrent(0);
    } catch (e) {
      teardown();
      toast.error(e instanceof Error ? e.message : "Failed to start assessment");
      setStarting(false);
      return;
    }
    setStarting(false);
  };

  // attach stream + analyzer once the video element exists
  useEffect(() => {
    const v = videoRef.current;
    const s = streamRef.current;
    if (!sessionId || !v || !s || analyzerRef.current) return;
    v.srcObject = s;
    v.play().catch(() => undefined);
    let cancelled = false;
    (async () => {
      try {
        const a = await createFaceAnalyzer(v);
        if (cancelled) { a.dispose(); return; }
        a.onStatus(setStatus);
        analyzerRef.current = a;
        setReady(true);
      } catch (e) {
        console.error(e);
        toast.error("Facial analysis could not be initialised. Your speech will still be scored.");
        setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  const updateSlot = (i: number, patch: Partial<SlotState>) =>
    setSlots((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));

  const startRec = async () => {
    const s = streamRef.current;
    if (!s) return;
    try {
      const audioOnly = new MediaStream(s.getAudioTracks());
      const r = await startRecorder(audioOnly);
      recorderRef.current = r;
      analyzerRef.current?.startCollecting();
      setElapsed(0);
      const tick = () => {
        setElapsed(recorderRef.current?.getElapsed() ?? 0);
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
      updateSlot(current, { status: "recording" });
    } catch (e) {
      console.error(e);
      toast.error("Microphone permission is required for communication assessment.");
    }
  };

  const stopRec = async () => {
    const r = recorderRef.current;
    if (!r) return;
    cancelAnimationFrame(rafRef.current);
    const frames = analyzerRef.current?.stopCollecting() ?? [];
    updateSlot(current, { status: "processing" });
    try {
      const { blob, metrics } = await r.stop();
      recorderRef.current = null;
      if (blob.size < 4096 || metrics.durationSeconds < 3) {
        toast.error("Recording too short — please read the full paragraph.");
        updateSlot(current, { status: "idle" });
        return;
      }
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user!.id;
      const path = `${uid}/${sessionId}/video-slot-${current + 1}.wav`;
      const up = await supabase.storage.from("recordings").upload(path, blob, { contentType: "audio/wav", upsert: true });
      if (up.error) throw new Error(up.error.message);

      const res = await submit({
        data: {
          sessionId: sessionId!,
          slot: current + 1,
          paragraphId: paragraphs[current].id,
          storagePath: path,
          metrics: {
            durationSeconds: metrics.durationSeconds,
            avgVolume: metrics.avgVolume,
            peakVolume: metrics.peakVolume,
            silenceRatio: metrics.silenceRatio,
            clipping: metrics.clipping,
          },
          faceFrames: frames.length ? frames.slice(0, 4000) : undefined,
        },
      });

      updateSlot(current, {
        status: "done",
        result: {
          audio: res.score.weighted,
          video: res.video && !res.video.insufficientData ? res.video.video : null,
          overall: res.overall,
          transcript: res.transcript,
          metrics: res.video
            ? {
                eyeContact: res.video.eyeContact,
                facialEngagement: res.video.facialEngagement,
                facialExpressiveness: res.video.facialExpressiveness,
                headStability: res.video.headStability,
                faceVisibility: res.video.faceVisibility,
              }
            : null,
          feedback: res.video ? res.video.feedback : null,
          warnings: res.video?.warnings ?? [],
          suggestions: res.video?.suggestions ?? [],
        },
      });
    } catch (e) {
      updateSlot(current, { status: "error", error: e instanceof Error ? e.message : "Failed" });
      toast.error(e instanceof Error ? e.message : "Failed to process recording");
    }
  };

  const allDone = slots.length === 3 && slots.every((s) => s.status === "done");

  const submitAll = async () => {
    if (!sessionId) return;
    setFinalizing(true);
    try {
      await finalize({ data: { sessionId } });
      teardown();
      navigate({ to: "/results/$sessionId", params: { sessionId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Finalize failed");
      setFinalizing(false);
    }
  };

  // ---------- Intro / consent ----------
  if (!sessionId) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-14">
        <Card className="glass border-0">
          <CardHeader>
            <CardTitle className="text-2xl">Video communication assessment</CardTitle>
            <CardDescription>
              You will read three passages aloud on camera. Alongside your speech, we estimate eye contact,
              facial engagement, head stability and face visibility.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border p-4 flex gap-3">
              <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
              <div className="text-sm space-y-1">
                <p className="font-medium">Your camera and microphone will be used for communication assessment.</p>
                <p className="text-muted-foreground">
                  Video frames are analysed locally in your browser using an open-source face landmark model.
                  The video itself is never uploaded or stored — only the resulting metrics and scores are saved.
                  Your camera is released as soon as the assessment ends.
                </p>
              </div>
            </div>
            <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
              <li>Sit directly in front of the camera in a well-lit room, alone in frame.</li>
              <li>Read each passage clearly at a natural pace (about 140 wpm).</li>
              <li>
                Final score = audio {Math.round(SCORE_WEIGHTS.audio * 100)}% + video {Math.round(SCORE_WEIGHTS.video * 100)}%.
              </li>
              <li>Gaze and expression estimates are approximate and evaluate communication signals only.</li>
            </ul>
            {camError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                {camError}
              </div>
            )}
            <Button onClick={begin} disabled={starting} size="lg" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow px-6 h-12">
              {starting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing camera…</> : <><Camera className="mr-2 h-5 w-5" />Allow camera & begin</>}
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  const p = paragraphs[current];
  const slot = slots[current];
  const recording = slot.status === "recording";

  const liveWarning = !status
    ? null
    : status.faceCount > 1
      ? "Only one person should be visible during the assessment."
      : !status.facePresent
        ? "Please position your face clearly inside the camera frame."
        : status.brightness < 0.15
          ? "Lighting is too low for reliable facial analysis."
          : !status.centered
            ? "Centre your face in the camera frame."
            : null;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 space-y-6">
      <div className="flex items-center gap-3">
        {slots.map((s, i) => (
          <div
            key={i}
            className={`flex-1 h-2 rounded-full transition ${i === current ? "bg-brand-gradient" : s.status === "done" ? "bg-success" : "bg-accent"}`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Video communication assessment</h1>
        <div className="flex gap-2">
          <Badge variant="secondary" className="capitalize">{p.difficulty}</Badge>
          <Badge variant="outline" className="capitalize">{p.category}</Badge>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* Camera */}
        <Card className="glass border-0 overflow-hidden">
          <div className="relative bg-black aspect-video">
            <video ref={videoRef} muted playsInline className="h-full w-full object-cover scale-x-[-1]" />
            {recording && (
              <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-white">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" /> REC
              </div>
            )}
            <div className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs tabular-nums text-white">
              {formatTime(elapsed)}
            </div>
            {liveWarning && (
              <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-black/70 px-3 py-2 text-xs text-white flex gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {liveWarning}
              </div>
            )}
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="text-sm text-muted-foreground">Paragraph {current + 1} of {paragraphs.length}</div>
            <p className="text-lg leading-relaxed font-medium">{p.content}</p>

            {recording && <Progress value={Math.min(100, (elapsed / 90) * 100)} className="h-2" />}

            <div className="flex flex-wrap gap-3">
              {slot.status === "idle" && (
                <Button onClick={startRec} disabled={!ready} size="lg" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow px-6">
                  {ready ? <><Video className="mr-2 h-5 w-5" />Start recording</> : <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Loading face model…</>}
                </Button>
              )}
              {recording && (
                <Button onClick={stopRec} size="lg" variant="destructive" className="rounded-full px-6">
                  <Square className="mr-2 h-4 w-4" />Stop recording
                </Button>
              )}
              {slot.status === "processing" && (
                <Button disabled size="lg" className="rounded-full px-6">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing video…
                </Button>
              )}
              {slot.status === "error" && (
                <Button onClick={() => updateSlot(current, { status: "idle", error: undefined })} variant="outline" className="rounded-full">
                  Try again
                </Button>
              )}
              {slot.status === "done" && current < paragraphs.length - 1 && (
                <Button onClick={() => setCurrent(current + 1)} className="rounded-full">
                  Continue to paragraph {current + 2} <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              )}
              {slot.status === "done" && (
                <Button variant="outline" className="rounded-full" onClick={() => updateSlot(current, { status: "idle", result: undefined })}>
                  Re-record
                </Button>
              )}
            </div>
            {slot.status === "error" && <p className="text-sm text-destructive">{slot.error}</p>}
          </CardContent>
        </Card>

        {/* Analysis panel */}
        <Card className="glass border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              {slot.status === "done" ? "Video analysis complete" : "What we evaluate"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {slot.status === "done" && slot.result ? (
              <>
                <div className="flex justify-around">
                  <ScoreRing value={slot.result.audio} label="Audio" size={80} />
                  <ScoreRing value={slot.result.video} label="Video" size={80} />
                  <ScoreRing value={slot.result.overall} label="Overall" size={80} />
                </div>
                {slot.result.metrics ? (
                  <div className="space-y-3">
                    <MetricBar label="Eye contact" value={slot.result.metrics.eyeContact} hint={slot.result.feedback?.eyeContact} />
                    <MetricBar label="Facial engagement" value={slot.result.metrics.facialEngagement} hint={slot.result.feedback?.facialEngagement} />
                    <MetricBar label="Facial expressiveness" value={slot.result.metrics.facialExpressiveness} hint={slot.result.feedback?.facialExpressiveness} />
                    <MetricBar label="Head stability" value={slot.result.metrics.headStability} hint={slot.result.feedback?.headStability} />
                    <MetricBar label="Face visibility" value={slot.result.metrics.faceVisibility} hint={slot.result.feedback?.faceVisibility} />
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Insufficient data for facial metrics on this passage.</p>
                )}
                {slot.result.warnings.map((w) => (
                  <p key={w} className="text-xs text-destructive flex gap-2"><AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />{w}</p>
                ))}
                {slot.result.suggestions.map((sug) => (
                  <p key={sug} className="text-xs text-muted-foreground">• {sug}</p>
                ))}
              </>
            ) : (
              <ul className="text-sm text-muted-foreground space-y-2 list-disc list-inside">
                <li>Speech: loudness, clarity, fluency, speaking rate, pronunciation</li>
                <li>Eye contact (approximate gaze direction)</li>
                <li>Facial engagement and expressiveness</li>
                <li>Head stability and face visibility</li>
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {allDone && (
        <div className="flex flex-wrap items-center justify-between gap-4 glass rounded-2xl p-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-success" />
            <div>
              <div className="font-semibold">All three passages recorded.</div>
              <div className="text-sm text-muted-foreground">Submit to see your combined communication report.</div>
            </div>
          </div>
          <Button onClick={submitAll} disabled={finalizing} size="lg" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow px-6">
            {finalizing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scoring…</> : <>View final results <ChevronRight className="ml-1 h-4 w-4" /></>}
          </Button>
        </div>
      )}
    </main>
  );
}

function formatTime(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
