import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreRecording, aggregate, type RecordingMetrics } from "@/lib/scoring";

const StartInput = z.object({}).optional();

export const startAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StartInput.parse(d ?? {}))
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // pick 1 random paragraph per difficulty
    const pick = async (diff: string) => {
      const { data, error } = await supabase.rpc("get_random_paragraph" as never, {} as never).single();
      if (error || !data) {
        const { data: rows, error: e2 } = await supabase
          .from("paragraphs").select("id").eq("difficulty", diff).limit(200);
        if (e2 || !rows?.length) throw new Error("No paragraphs available");
        return rows[Math.floor(Math.random() * rows.length)].id as string;
      }
      return (data as { id: string }).id;
    };
    const [easy, medium, hard] = await Promise.all([pick("easy"), pick("medium"), pick("hard")]);

    const { data: session, error } = await supabase
      .from("assessment_sessions")
      .insert({ user_id: userId, paragraph_easy_id: easy, paragraph_medium_id: medium, paragraph_hard_id: hard })
      .select("id, paragraph_easy_id, paragraph_medium_id, paragraph_hard_id")
      .single();
    if (error) throw new Error(error.message);

    const ids = [session.paragraph_easy_id, session.paragraph_medium_id, session.paragraph_hard_id].filter((x): x is string => !!x);
    const { data: paragraphs } = await supabase.from("paragraphs").select("id, category, difficulty, content").in("id", ids);
    const byId = new Map((paragraphs ?? []).map((p) => [p.id, p]));
    return {
      sessionId: session.id,
      paragraphs: [byId.get(easy), byId.get(medium), byId.get(hard)].filter(Boolean),
    };
  });

const SubmitInput = z.object({
  sessionId: z.string().uuid(),
  slot: z.number().int().min(1).max(3),
  paragraphId: z.string().uuid(),
  storagePath: z.string().min(1),
  metrics: z.object({
    durationSeconds: z.number(),
    avgVolume: z.number(),
    peakVolume: z.number(),
    silenceRatio: z.number(),
    clipping: z.boolean(),
  }),
});

export const submitRecording = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Validate the session belongs to the user
    const { data: session, error: sErr } = await supabase
      .from("assessment_sessions").select("id, user_id, status")
      .eq("id", data.sessionId).single();
    if (sErr || !session) throw new Error("Session not found");
    if (session.user_id !== userId) throw new Error("Forbidden");
    if (session.status !== "in_progress") throw new Error("Session already completed");

    // Fetch paragraph reference
    const { data: paragraph, error: pErr } = await supabase
      .from("paragraphs").select("id, content").eq("id", data.paragraphId).single();
    if (pErr || !paragraph) throw new Error("Paragraph not found");

    // Download the audio from storage using service role (client uploaded under their user folder)
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fileData, error: dlErr } = await supabaseAdmin.storage
      .from("recordings").download(data.storagePath);
    if (dlErr || !fileData) throw new Error("Failed to download recording: " + (dlErr?.message ?? "unknown"));

    // Transcribe via Lovable AI Gateway (Whisper-equivalent, free tier)
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");
    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", fileData, "recording.wav");
    // non-streaming for buffered transcript
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new Error(`Transcription failed: ${resp.status} ${t}`);
    }
    const trJson = (await resp.json()) as { text?: string };
    const transcript = (trJson.text ?? "").trim();

    // Insert recording row (may already exist for this slot on re-record — upsert)
    const upsertRec = await supabase
      .from("recordings")
      .upsert(
        {
          session_id: data.sessionId,
          user_id: userId,
          paragraph_id: data.paragraphId,
          slot: data.slot,
          storage_path: data.storagePath,
          duration_seconds: data.metrics.durationSeconds,
          client_metrics: data.metrics,
        },
        { onConflict: "session_id,slot" },
      )
      .select("id")
      .single();
    if (upsertRec.error) throw new Error(upsertRec.error.message);
    const recordingId = upsertRec.data.id;

    // Save transcript
    await supabase.from("transcripts").upsert(
      { recording_id: recordingId, text: transcript, raw: trJson as never },
      { onConflict: "recording_id" },
    );

    // Score
    const metrics: RecordingMetrics = data.metrics;
    const s = scoreRecording(paragraph.content, transcript, metrics);
    await supabase.from("analysis_results").upsert(
      {
        recording_id: recordingId,
        accuracy: s.accuracy, fluency: s.fluency, pronunciation: s.pronunciation,
        clarity: s.clarity, confidence: s.confidence, pace: s.pace, voice_quality: s.voiceQuality,
        wer: s.wer, cer: s.cer, wpm: s.wpm,
        silence_ratio: metrics.silenceRatio, avg_volume: metrics.avgVolume, peak_volume: metrics.peakVolume,
        weighted_score: s.weighted, details: s.details as never,
      },
      { onConflict: "recording_id" },
    );

    return { recordingId, transcript, score: s };
  });

const FinalizeInput = z.object({ sessionId: z.string().uuid() });

export const finalizeAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FinalizeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: session, error } = await supabase
      .from("assessment_sessions").select("id, user_id").eq("id", data.sessionId).single();
    if (error || !session) throw new Error("Session not found");
    if (session.user_id !== userId) throw new Error("Forbidden");

    const { data: recs, error: rErr } = await supabase
      .from("recordings").select("id, slot").eq("session_id", data.sessionId).order("slot");
    if (rErr) throw new Error(rErr.message);
    if (!recs || recs.length < 3) throw new Error("All three recordings are required");

    const ids = recs.map((r) => r.id);
    const { data: analyses } = await supabase.from("analysis_results").select("*").in("recording_id", ids);
    if (!analyses || analyses.length < 3) throw new Error("Analyses missing");

    const scored = analyses.map((a) => ({
      accuracy: Number(a.accuracy ?? 0),
      fluency: Number(a.fluency ?? 0),
      pronunciation: Number(a.pronunciation ?? 0),
      clarity: Number(a.clarity ?? 0),
      confidence: Number(a.confidence ?? 0),
      pace: Number(a.pace ?? 0),
      voiceQuality: Number(a.voice_quality ?? 0),
      weighted: Number(a.weighted_score ?? 0),
      wer: Number(a.wer ?? 0),
      cer: Number(a.cer ?? 0),
      wpm: Number(a.wpm ?? 0),
      details: {},
    }));
    const agg = aggregate(scored);

    const { error: uErr } = await supabase
      .from("assessment_sessions")
      .update({
        status: "completed",
        overall_score: agg.overall,
        overall_grade: agg.grade,
        breakdown: agg.breakdown as never,
        strengths: agg.strengths as never,
        weaknesses: agg.weaknesses as never,
        suggestions: agg.suggestions as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId);
    if (uErr) throw new Error(uErr.message);

    return { sessionId: data.sessionId, ...agg };
  });
