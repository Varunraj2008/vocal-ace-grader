import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { scoreRecording, aggregate, loudnessScore, gradeFor, type RecordingMetrics } from "@/lib/scoring";
import { scoreVideoFrames, combineScores, SCORE_WEIGHTS } from "@/lib/videoScoring";

const StartInput = z.object({ mode: z.enum(["audio", "video"]).default("audio") }).partial().optional();

export const startAssessment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StartInput.parse(d ?? {}))
  .handler(async ({ data, context }) => {
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
      .insert({ user_id: userId, mode: data?.mode ?? "audio", paragraph_easy_id: easy, paragraph_medium_id: medium, paragraph_hard_id: hard })
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

const FaceFrameSchema = z.object({
  t: z.number(),
  faceCount: z.number(),
  present: z.boolean(),
  yaw: z.number(),
  pitch: z.number(),
  roll: z.number(),
  gazeOffset: z.number(),
  lookingAtCamera: z.boolean(),
  faceWidthRatio: z.number(),
  centerX: z.number(),
  centerY: z.number(),
  brightness: z.number(),
  expression: z.number(),
  motion: z.number(),
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
  /** Present only for video-mode assessments. Landmark-derived frame samples (no raw video). */
  faceFrames: z.array(FaceFrameSchema).max(4000).optional(),
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

    // ---- Video (facial) analysis — only when frames were captured client-side ----
    let videoScore: ReturnType<typeof scoreVideoFrames> | null = null;
    if (data.faceFrames && data.faceFrames.length) {
      videoScore = scoreVideoFrames(data.faceFrames);
      await supabase
        .from("recordings")
        .update({ video_metrics: videoScore as never })
        .eq("id", recordingId);
    }

    const audioSub = {
      loudness: loudnessScore(metrics.avgVolume, metrics.clipping),
      clarity: s.clarity,
      fluency: s.fluency,
      speakingRate: s.pace,
    };
    const overall = combineScores(s.weighted, videoScore?.video ?? 0, !!videoScore && !videoScore.insufficientData);

    await supabase.from("assessment_results").upsert(
      {
        user_id: userId,
        assessment_id: data.sessionId,
        paragraph_id: data.paragraphId,
        paragraph_number: data.slot,
        mode: videoScore ? "video" : "audio",
        audio_score: s.weighted,
        video_score: videoScore ? videoScore.video : null,
        overall_score: overall,
        loudness_score: audioSub.loudness,
        clarity_score: audioSub.clarity,
        fluency_score: audioSub.fluency,
        speaking_rate_score: audioSub.speakingRate,
        eye_contact_score: videoScore ? videoScore.eyeContact : null,
        facial_engagement_score: videoScore ? videoScore.facialEngagement : null,
        facial_expressiveness_score: videoScore ? videoScore.facialExpressiveness : null,
        head_stability_score: videoScore ? videoScore.headStability : null,
        face_visibility_score: videoScore ? videoScore.faceVisibility : null,
        details: (videoScore ? { video: videoScore, audio: audioSub } : { audio: audioSub }) as never,
      },
      { onConflict: "assessment_id,paragraph_number" },
    );

    return { recordingId, transcript, score: s, audioSub, video: videoScore, overall };
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

    // Per-paragraph results (video mode adds facial metrics on top of the audio score)
    const { data: perPara } = await supabase
      .from("assessment_results")
      .select("*")
      .eq("assessment_id", data.sessionId)
      .order("paragraph_number");

    const videoRows = (perPara ?? []).filter((r) => r.video_score != null);
    const hasVideo = videoRows.length > 0;
    const avg = (xs: number[]) => (xs.length ? +(xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(2) : 0);
    const videoAvg = avg(videoRows.map((r) => Number(r.video_score)));
    const audioAvg = agg.overall;
    const overall = combineScores(audioAvg, videoAvg, hasVideo);

    const videoBreakdown = hasVideo
      ? {
          eyeContact: avg(videoRows.map((r) => Number(r.eye_contact_score ?? 0))),
          facialEngagement: avg(videoRows.map((r) => Number(r.facial_engagement_score ?? 0))),
          facialExpressiveness: avg(videoRows.map((r) => Number(r.facial_expressiveness_score ?? 0))),
          headStability: avg(videoRows.map((r) => Number(r.head_stability_score ?? 0))),
          faceVisibility: avg(videoRows.map((r) => Number(r.face_visibility_score ?? 0))),
          weights: SCORE_WEIGHTS,
        }
      : null;

    const strengths = [...agg.strengths];
    const weaknesses = [...agg.weaknesses];
    const suggestions = [...agg.suggestions];
    if (videoBreakdown) {
      const entries: [string, number][] = [
        ["Eye contact", videoBreakdown.eyeContact],
        ["Facial engagement", videoBreakdown.facialEngagement],
        ["Facial expressiveness", videoBreakdown.facialExpressiveness],
        ["Head stability", videoBreakdown.headStability],
        ["Face visibility", videoBreakdown.faceVisibility],
      ];
      for (const [label, val] of entries) {
        if (val >= 85) strengths.push(`${label} is excellent (${val}).`);
        else if (val < 65) {
          weaknesses.push(`${label} needs work (${val}).`);
          suggestions.push(
            label === "Eye contact"
              ? "Look toward the camera lens more consistently while speaking."
              : label === "Head stability"
                ? "Settle into a steady posture to reduce continuous head movement."
                : label === "Face visibility"
                  ? "Sit directly in front of the camera so your face stays fully in frame."
                  : "Aim for natural, moderate facial expression while speaking.",
          );
        }
      }
    }

    const { error: uErr } = await supabase
      .from("assessment_sessions")
      .update({
        status: "completed",
        mode: hasVideo ? "video" : "audio",
        overall_score: overall,
        audio_score: audioAvg,
        video_score: hasVideo ? videoAvg : null,
        overall_grade: gradeFor(overall),
        breakdown: agg.breakdown as never,
        video_breakdown: videoBreakdown as never,
        strengths: strengths as never,
        weaknesses: weaknesses as never,
        suggestions: suggestions as never,
        completed_at: new Date().toISOString(),
      })
      .eq("id", data.sessionId);
    if (uErr) throw new Error(uErr.message);

    return {
      sessionId: data.sessionId,
      ...agg,
      overall,
      grade: gradeFor(overall),
      audioScore: audioAvg,
      videoScore: hasVideo ? videoAvg : null,
      videoBreakdown,
      paragraphs: perPara ?? [],
      strengths,
      weaknesses,
      suggestions,
    };
  });
