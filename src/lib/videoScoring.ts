// Pure, deterministic video/facial communication scoring.
// Evaluates only observable communication signals (gaze direction, head steadiness,
// face visibility, facial movement variation). It makes no medical, psychological,
// personality or emotional-state claims, and does not consider appearance.

/** Configurable blend of audio vs video for the overall communication score. */
export const SCORE_WEIGHTS = {
  audio: 0.6,
  video: 0.4,
} as const;

/** Configurable weights within the video score. */
export const VIDEO_WEIGHTS = {
  eyeContact: 0.3,
  facialEngagement: 0.2,
  facialExpressiveness: 0.15,
  headStability: 0.2,
  faceVisibility: 0.15,
} as const;

/** Minimum share of sampled frames with a tracked face before metrics are trusted. */
export const MIN_TRACKING_COVERAGE = 0.35;

export type FaceFrame = {
  /** ms since recording start */
  t: number;
  faceCount: number;
  present: boolean;
  /** head rotation in degrees */
  yaw: number;
  pitch: number;
  roll: number;
  /** approximate combined gaze deviation from camera, in degrees */
  gazeOffset: number;
  lookingAtCamera: boolean;
  /** face bounding-box width as a fraction of frame width */
  faceWidthRatio: number;
  /** normalized face centre (0..1) */
  centerX: number;
  centerY: number;
  /** mean luma 0..1 of the sampled frame */
  brightness: number;
  /** aggregate facial-expression activity 0..1 (blendshape based) */
  expression: number;
  /** frame-to-frame landmark motion, normalized */
  motion: number;
};

export type VideoScore = {
  eyeContact: number;
  facialEngagement: number;
  facialExpressiveness: number;
  headStability: number;
  faceVisibility: number;
  /** weighted 0-100 video score */
  video: number;
  /** true when face tracking coverage was too low to trust the metrics */
  insufficientData: boolean;
  feedback: {
    eyeContact: string;
    facialEngagement: string;
    facialExpressiveness: string;
    headStability: string;
    faceVisibility: string;
  };
  warnings: string[];
  suggestions: string[];
  details: Record<string, number | boolean>;
};

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round = (v: number) => Math.round(v * 10) / 10;

function mean(xs: number[]) {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}
function stddev(xs: number[]) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((v) => (v - m) ** 2)));
}

export function scoreVideoFrames(frames: FaceFrame[]): VideoScore {
  const total = frames.length;
  const visible = frames.filter((f) => f.present);
  const coverage = total ? visible.length / total : 0;
  const insufficientData = total < 8 || coverage < MIN_TRACKING_COVERAGE;

  const warnings: string[] = [];
  const suggestions: string[] = [];

  // ---- Face visibility -----------------------------------------------------
  const inFrame = visible.filter(
    (f) => f.centerX > 0.12 && f.centerX < 0.88 && f.centerY > 0.1 && f.centerY < 0.9,
  );
  const visibilityRatio = total ? visible.length / total : 0;
  const inFrameRatio = total ? inFrame.length / total : 0;
  const faceVisibility = clamp(Math.round(visibilityRatio * 70 + inFrameRatio * 30));

  if (visibilityRatio < 0.75) {
    warnings.push(
      "Your face was not clearly visible for part of the recording. Try sitting directly in front of the camera with adequate lighting.",
    );
  }

  // ---- Eye contact ---------------------------------------------------------
  const lookingFrames = visible.filter((f) => f.lookingAtCamera).length;
  const eyeContactPct = visible.length ? (lookingFrames / visible.length) * 100 : 0;
  const eyeContact = insufficientData ? 0 : clamp(Math.round(eyeContactPct));

  // ---- Head stability ------------------------------------------------------
  const yaw = visible.map((f) => f.yaw);
  const pitch = visible.map((f) => f.pitch);
  const yawVar = stddev(yaw);
  const pitchVar = stddev(pitch);
  const drift = mean(visible.map((f) => Math.abs(f.yaw))) + mean(visible.map((f) => Math.abs(f.pitch)));
  // Small natural movement (<6deg sd) is not penalised at all.
  const excess = Math.max(0, yawVar - 6) + Math.max(0, pitchVar - 6);
  const headStability = insufficientData
    ? 0
    : clamp(Math.round(100 - excess * 3.2 - Math.max(0, drift - 24) * 0.8));

  // ---- Facial expressiveness ----------------------------------------------
  // Reward natural variation; neither a frozen face nor exaggerated movement.
  const expr = visible.map((f) => f.expression);
  const exprMean = mean(expr);
  const exprVar = stddev(expr);
  const idealMean = 0.16;
  const idealVar = 0.07;
  const meanMiss = Math.abs(exprMean - idealMean) / idealMean;
  const varMiss = Math.abs(exprVar - idealVar) / idealVar;
  const facialExpressiveness = insufficientData
    ? 0
    : clamp(Math.round(100 - Math.min(meanMiss, 2) * 30 - Math.min(varMiss, 2) * 20));

  // ---- Facial engagement ---------------------------------------------------
  // Combines natural facial movement, expression presence and steady visibility.
  const motionMean = mean(visible.map((f) => f.motion));
  const idealMotion = 0.012;
  const motionMiss = Math.abs(motionMean - idealMotion) / idealMotion;
  const facialEngagement = insufficientData
    ? 0
    : clamp(
        Math.round(
          100 - Math.min(motionMiss, 2) * 25 - Math.min(meanMiss, 2) * 15 - (1 - visibilityRatio) * 40,
        ),
      );

  // ---- Lighting / framing guidance (suggestions, light scoring impact) -----
  const brightness = mean(frames.map((f) => f.brightness));
  const faceSize = mean(visible.map((f) => f.faceWidthRatio));
  if (brightness < 0.22) suggestions.push("Lighting is slightly low. Try facing a light source.");
  if (brightness > 0.85) suggestions.push("The video looks over-exposed. Reduce direct light behind or on the camera.");
  if (faceSize > 0 && faceSize < 0.16) suggestions.push("Your face appears small in frame. Move a little closer to the camera.");
  if (faceSize > 0.62) suggestions.push("You are very close to the camera. Move back slightly so your whole face is framed.");
  if (inFrameRatio < visibilityRatio - 0.15) suggestions.push("Keep your face centred in the camera frame.");

  const multiFace = frames.filter((f) => f.faceCount > 1).length;
  if (total && multiFace / total > 0.15) {
    warnings.push("More than one face was visible during the recording. Only one person should be visible during the assessment.");
  }

  const video = insufficientData
    ? 0
    : round(
        eyeContact * VIDEO_WEIGHTS.eyeContact +
          facialEngagement * VIDEO_WEIGHTS.facialEngagement +
          facialExpressiveness * VIDEO_WEIGHTS.facialExpressiveness +
          headStability * VIDEO_WEIGHTS.headStability +
          faceVisibility * VIDEO_WEIGHTS.faceVisibility,
      );

  const na = "Insufficient data — face tracking confidence was too low to evaluate this reliably.";

  return {
    eyeContact,
    facialEngagement,
    facialExpressiveness,
    headStability,
    faceVisibility,
    video,
    insufficientData,
    feedback: {
      eyeContact: insufficientData
        ? na
        : eyeContact >= 80
          ? "Your eye contact was consistent for most of the response."
          : eyeContact >= 60
            ? "You looked toward the camera fairly often, with some time looking away."
            : "You often looked away from the camera. Try to address the lens more directly. (Gaze estimation is approximate.)",
      facialEngagement: insufficientData
        ? na
        : facialEngagement >= 80
          ? "You appeared naturally engaged with the camera throughout."
          : facialEngagement >= 60
            ? "Your facial engagement was moderate and generally appropriate."
            : "Your face stayed largely static. A little natural movement helps you appear engaged.",
      facialExpressiveness: insufficientData
        ? na
        : facialExpressiveness >= 80
          ? "Your facial expression showed natural, appropriate variation."
          : facialExpressiveness >= 60
            ? "Your facial expression showed some variation. Try maintaining slightly more natural expression while speaking."
            : exprMean > idealMean
              ? "Your facial movement was quite pronounced. A calmer, more natural expression usually reads better."
              : "Your expression stayed mostly neutral. A little more natural expression would help.",
      headStability: insufficientData
        ? na
        : headStability >= 80
          ? "Your head movement was generally stable with minor natural movement."
          : headStability >= 60
            ? "There was noticeable head movement at times. Try to settle into a steady posture."
            : "Frequent head movement made you harder to follow. Keep a steadier position while speaking.",
      faceVisibility: insufficientData
        ? na
        : faceVisibility >= 90
          ? "Your face was clearly visible throughout the recording."
          : faceVisibility >= 70
            ? "Your face was visible for most of the recording, with brief gaps."
            : "Your face was frequently outside the frame or not detected.",
    },
    warnings,
    suggestions,
    details: {
      sampledFrames: total,
      faceFrames: visible.length,
      trackingCoverage: round(coverage * 100),
      eyeContactPct: round(eyeContactPct),
      yawVariation: round(yawVar),
      pitchVariation: round(pitchVar),
      expressionMean: Math.round(exprMean * 1000) / 1000,
      expressionVariation: Math.round(exprVar * 1000) / 1000,
      motionMean: Math.round(motionMean * 1000) / 1000,
      avgBrightness: Math.round(brightness * 1000) / 1000,
      avgFaceWidthRatio: Math.round(faceSize * 1000) / 1000,
      multiFaceFrames: multiFace,
    },
  };
}

/** Audio sub-scores presented in the video report (derived from existing audio scoring). */
export type AudioSubScores = {
  loudness: number;
  clarity: number;
  fluency: number;
  speakingRate: number;
};

export function combineScores(audio: number, video: number, hasVideo: boolean) {
  if (!hasVideo) return round(audio);
  return round(audio * SCORE_WEIGHTS.audio + video * SCORE_WEIGHTS.video);
}
