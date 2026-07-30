// Pure scoring utilities: WER/CER, per-recording scoring, weighted overall.

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s']/g, " ").replace(/\s+/g, " ").trim();
}

export function tokenize(s: string): string[] {
  const n = normalize(s);
  return n ? n.split(" ") : [];
}

// Levenshtein for arrays (word edit distance).
export function editDistance<T>(a: T[], b: T[]): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

export type RecordingMetrics = {
  durationSeconds: number;
  avgVolume: number;
  peakVolume: number;
  silenceRatio: number;
  clipping: boolean;
};

export type PerRecordingScore = {
  accuracy: number;
  fluency: number;
  pronunciation: number;
  clarity: number;
  confidence: number;
  pace: number;
  voiceQuality: number;
  wer: number;
  cer: number;
  wpm: number;
  weighted: number;
  details: Record<string, number | string | boolean>;
};

const WEIGHTS = {
  accuracy: 0.35, fluency: 0.20, pronunciation: 0.15,
  clarity: 0.10, confidence: 0.10, pace: 0.05, voiceQuality: 0.05,
} as const;

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

export function scoreRecording(reference: string, transcript: string, m: RecordingMetrics): PerRecordingScore {
  const refWords = tokenize(reference);
  const hypWords = tokenize(transcript);
  const wordEd = editDistance(refWords, hypWords);
  const wer = refWords.length ? wordEd / refWords.length : 1;
  const refChars = normalize(reference).replace(/\s/g, "").split("");
  const hypChars = normalize(transcript).replace(/\s/g, "").split("");
  const charEd = editDistance(refChars, hypChars);
  const cer = refChars.length ? charEd / refChars.length : 1;
  const wpm = m.durationSeconds > 0 ? (hypWords.length / m.durationSeconds) * 60 : 0;

  // Strict accuracy: 1 - WER, penalize hard at high WER, floor at 0.
  const accuracy = clamp(Math.round((1 - Math.min(wer, 1)) * 100 - Math.max(0, wer - 0.15) * 40));

  // Pronunciation approx via CER (chars mismatch => articulation issues).
  const pronunciation = clamp(Math.round((1 - Math.min(cer, 1)) * 100 - Math.max(0, cer - 0.10) * 45));

  // Fluency: penalize silence ratio and very slow/fast pace.
  const idealWpmMin = 120, idealWpmMax = 170;
  const paceMiss = wpm < idealWpmMin ? (idealWpmMin - wpm) / idealWpmMin
                  : wpm > idealWpmMax ? (wpm - idealWpmMax) / idealWpmMax : 0;
  const silencePenalty = Math.max(0, m.silenceRatio - 0.20) * 120;
  const fluency = clamp(Math.round(95 - paceMiss * 55 - silencePenalty));

  // Pace: dedicated pace score.
  const pace = clamp(Math.round(100 - paceMiss * 100));

  // Clarity: volume in a good band, low clipping.
  const volTarget = 0.15;
  const volMiss = Math.abs(m.avgVolume - volTarget) / volTarget;
  const clarity = clamp(Math.round(95 - volMiss * 50 - (m.clipping ? 15 : 0) - Math.max(0, m.silenceRatio - 0.15) * 60));

  // Voice quality: peak headroom, avoid clipping.
  const voiceQuality = clamp(Math.round(90 - (m.clipping ? 25 : 0) - Math.max(0, m.peakVolume - 0.90) * 200 + (m.peakVolume < 0.05 ? -20 : 0)));

  // Confidence: proxy — accuracy meets sustained volume + steady pace.
  const confidence = clamp(Math.round((accuracy * 0.5) + (fluency * 0.3) + (m.avgVolume > 0.05 ? 20 : 0) - (m.silenceRatio > 0.3 ? 20 : 0)));

  const weighted =
    accuracy * WEIGHTS.accuracy + fluency * WEIGHTS.fluency + pronunciation * WEIGHTS.pronunciation +
    clarity * WEIGHTS.clarity + confidence * WEIGHTS.confidence + pace * WEIGHTS.pace + voiceQuality * WEIGHTS.voiceQuality;

  return {
    accuracy, fluency, pronunciation, clarity, confidence, pace, voiceQuality,
    wer: +wer.toFixed(4), cer: +cer.toFixed(4), wpm: +wpm.toFixed(1),
    weighted: +weighted.toFixed(2),
    details: {
      refWordCount: refWords.length,
      hypWordCount: hypWords.length,
      wordEdits: wordEd,
      charEdits: charEd,
      durationSeconds: +m.durationSeconds.toFixed(2),
      avgVolume: +m.avgVolume.toFixed(4),
      peakVolume: +m.peakVolume.toFixed(4),
      silenceRatio: +m.silenceRatio.toFixed(4),
      clipping: m.clipping,
    },
  };
}

export function gradeFor(score: number): string {
  if (score >= 90) return "A+";
  if (score >= 85) return "A";
  if (score >= 80) return "A-";
  if (score >= 75) return "B+";
  if (score >= 70) return "B";
  if (score >= 65) return "B-";
  if (score >= 60) return "C+";
  if (score >= 55) return "C";
  if (score >= 50) return "C-";
  if (score >= 40) return "D";
  return "F";
}

export function aggregate(scores: PerRecordingScore[]) {
  const avg = (k: keyof PerRecordingScore) =>
    +(scores.reduce((s, x) => s + (x[k] as number), 0) / scores.length).toFixed(2);
  const breakdown = {
    accuracy: avg("accuracy"),
    fluency: avg("fluency"),
    pronunciation: avg("pronunciation"),
    clarity: avg("clarity"),
    confidence: avg("confidence"),
    pace: avg("pace"),
    voiceQuality: avg("voiceQuality"),
    wer: +(scores.reduce((s, x) => s + x.wer, 0) / scores.length).toFixed(4),
    cer: +(scores.reduce((s, x) => s + x.cer, 0) / scores.length).toFixed(4),
    wpm: +(scores.reduce((s, x) => s + x.wpm, 0) / scores.length).toFixed(1),
  };
  const overall = +avg("weighted");
  const grade = gradeFor(overall);

  const strengths: string[] = [];
  const weaknesses: string[] = [];
  const suggestions: string[] = [];
  const entries: [string, number][] = [
    ["Reading accuracy", breakdown.accuracy], ["Fluency", breakdown.fluency],
    ["Pronunciation", breakdown.pronunciation], ["Clarity", breakdown.clarity],
    ["Confidence", breakdown.confidence], ["Pace", breakdown.pace], ["Voice quality", breakdown.voiceQuality],
  ];
  for (const [label, val] of entries) {
    if (val >= 85) strengths.push(`${label} is excellent (${val}).`);
    else if (val < 65) weaknesses.push(`${label} needs work (${val}).`);
  }
  if (breakdown.wer > 0.15) suggestions.push("Slow down slightly and read each word — your word error rate is above 15%.");
  if (breakdown.wpm < 120) suggestions.push("Aim for 130–160 words per minute for a confident, natural pace.");
  if (breakdown.wpm > 180) suggestions.push("You're rushing — pause briefly between sentences.");
  if (breakdown.fluency < 70) suggestions.push("Reduce long pauses between phrases to improve fluency.");
  if (breakdown.clarity < 70) suggestions.push("Speak closer to the microphone or adjust input volume for clearer audio.");
  if (!strengths.length) strengths.push("You completed all three passages — keep practicing daily.");
  if (!suggestions.length) suggestions.push("Great job! Focus on maintaining consistency across sessions.");

  return { overall, grade, breakdown, strengths, weaknesses, suggestions };
}

/** Loudness sub-score derived from measured average volume (deterministic). */
export function loudnessScore(avgVolume: number, clipping: boolean): number {
  const target = 0.15;
  const miss = Math.abs(avgVolume - target) / target;
  return clamp(Math.round(100 - Math.min(miss, 2) * 45 - (clipping ? 15 : 0)));
}
