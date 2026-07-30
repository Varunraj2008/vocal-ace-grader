// Browser-side facial analysis using MediaPipe Face Landmarker (free, open source).
// All frames are processed locally in the browser — no video is uploaded anywhere.

import type { FaceFrame } from "@/lib/videoScoring";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.0/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/** Frames per second sampled for landmark analysis (keeps the browser responsive). */
export const SAMPLE_FPS = 8;

export type LiveStatus = {
  facePresent: boolean;
  faceCount: number;
  lookingAtCamera: boolean;
  brightness: number;
  faceWidthRatio: number;
  centered: boolean;
};

export type FaceAnalyzer = {
  /** Begin collecting frames (called when recording starts). */
  startCollecting: () => void;
  /** Stop collecting and return all sampled frames. */
  stopCollecting: () => FaceFrame[];
  onStatus: (cb: (s: LiveStatus) => void) => void;
  /** Stop the sampling loop and release the landmarker. */
  dispose: () => void;
};

const EXPRESSION_KEYS = [
  "mouthSmileLeft",
  "mouthSmileRight",
  "browInnerUp",
  "browOuterUpLeft",
  "browOuterUpRight",
  "cheekSquintLeft",
  "cheekSquintRight",
  "eyeSquintLeft",
  "eyeSquintRight",
  "mouthPucker",
  "mouthFrownLeft",
  "mouthFrownRight",
];

const deg = (r: number) => (r * 180) / Math.PI;

export async function createFaceAnalyzer(video: HTMLVideoElement): Promise<FaceAnalyzer> {
  const { FilesetResolver, FaceLandmarker } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 2,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });

  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 48;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  let collecting = false;
  let startedAt = 0;
  let disposed = false;
  const frames: FaceFrame[] = [];
  let statusCb: ((s: LiveStatus) => void) | undefined;
  let prevLandmarks: { x: number; y: number }[] | null = null;
  let lastTs = -1;

  const sampleBrightness = () => {
    if (!ctx || video.videoWidth === 0) return 0.5;
    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      for (let i = 0; i < data.length; i += 4) {
        sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      }
      return sum / (data.length / 4);
    } catch {
      return 0.5;
    }
  };

  const tick = () => {
    if (disposed) return;
    if (video.readyState < 2 || video.videoWidth === 0) return;
    const ts = performance.now();
    if (ts <= lastTs) return;
    lastTs = ts;

    let result;
    try {
      result = landmarker.detectForVideo(video, ts);
    } catch {
      return;
    }

    const brightness = sampleBrightness();
    const faces = result.faceLandmarks ?? [];
    const faceCount = faces.length;
    const present = faceCount > 0;

    let yaw = 0,
      pitch = 0,
      roll = 0,
      gazeOffset = 0,
      lookingAtCamera = false,
      faceWidthRatio = 0,
      centerX = 0.5,
      centerY = 0.5,
      expression = 0,
      motion = 0;

    if (present) {
      const lm = faces[0];
      let minX = 1,
        maxX = 0,
        minY = 1,
        maxY = 0;
      for (const p of lm) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      }
      faceWidthRatio = maxX - minX;
      centerX = (minX + maxX) / 2;
      centerY = (minY + maxY) / 2;

      const mat = result.facialTransformationMatrixes?.[0]?.data;
      if (mat && mat.length >= 16) {
        const r02 = mat[8],
          r12 = mat[9],
          r22 = mat[10],
          r10 = mat[1],
          r11 = mat[5];
        yaw = deg(Math.atan2(r02, r22));
        pitch = deg(Math.asin(Math.max(-1, Math.min(1, -r12))));
        roll = deg(Math.atan2(r10, r11));
      }

      const bs = result.faceBlendshapes?.[0]?.categories ?? [];
      const get = (name: string) => bs.find((c) => c.categoryName === name)?.score ?? 0;

      const eyeH =
        (get("eyeLookOutLeft") + get("eyeLookInRight")) / 2 -
        (get("eyeLookInLeft") + get("eyeLookOutRight")) / 2;
      const eyeV = (get("eyeLookUpLeft") + get("eyeLookUpRight")) / 2 - (get("eyeLookDownLeft") + get("eyeLookDownRight")) / 2;

      const gazeH = yaw + eyeH * 30;
      const gazeV = pitch + eyeV * 25;
      gazeOffset = Math.sqrt(gazeH * gazeH + gazeV * gazeV);
      lookingAtCamera = Math.abs(gazeH) < 20 && Math.abs(gazeV) < 18;

      expression = EXPRESSION_KEYS.reduce((s, k) => s + get(k), 0) / EXPRESSION_KEYS.length;

      if (prevLandmarks && prevLandmarks.length === lm.length) {
        let d = 0;
        for (let i = 0; i < lm.length; i += 4) {
          d += Math.abs(lm[i].x - prevLandmarks[i].x) + Math.abs(lm[i].y - prevLandmarks[i].y);
        }
        motion = d / Math.ceil(lm.length / 4);
      }
      prevLandmarks = lm.map((p) => ({ x: p.x, y: p.y }));
    } else {
      prevLandmarks = null;
    }

    if (collecting) {
      frames.push({
        t: ts - startedAt,
        faceCount,
        present,
        yaw,
        pitch,
        roll,
        gazeOffset,
        lookingAtCamera,
        faceWidthRatio,
        centerX,
        centerY,
        brightness,
        expression,
        motion,
      });
    }

    statusCb?.({
      facePresent: present,
      faceCount,
      lookingAtCamera,
      brightness,
      faceWidthRatio,
      centered: centerX > 0.2 && centerX < 0.8 && centerY > 0.15 && centerY < 0.85,
    });
  };

  const interval = window.setInterval(tick, Math.round(1000 / SAMPLE_FPS));

  return {
    startCollecting: () => {
      frames.length = 0;
      startedAt = performance.now();
      collecting = true;
    },
    stopCollecting: () => {
      collecting = false;
      return frames.slice();
    },
    onStatus: (cb) => {
      statusCb = cb;
    },
    dispose: () => {
      disposed = true;
      collecting = false;
      window.clearInterval(interval);
      try {
        landmarker.close();
      } catch {
        /* noop */
      }
    },
  };
}
