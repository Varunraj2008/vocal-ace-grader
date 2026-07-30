// Browser audio recorder: captures PCM, encodes to WAV, computes real-time metrics.

export type AudioMetrics = {
  durationSeconds: number;
  avgVolume: number;
  peakVolume: number;
  silenceRatio: number;
  rmsSamples: number[];
  clipping: boolean;
};

export type Recorder = {
  stop: () => Promise<{ blob: Blob; metrics: AudioMetrics }>;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  onLevel: (cb: (rms: number) => void) => void;
  getElapsed: () => number;
};

const TARGET_SAMPLE_RATE = 16000;
const SILENCE_RMS = 0.008;
const CLIP_THRESHOLD = 0.98;

export async function startRecorder(existingStream?: MediaStream): Promise<Recorder> {
  const ownsStream = !existingStream;
  const stream =
    existingStream ??
    (await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    }));
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  const chunks: Float32Array[] = [];
  const rmsSamples: number[] = [];
  let paused = false;
  let peak = 0;
  let clipping = false;
  let started = performance.now();
  let pausedAccum = 0;
  let pausedAt = 0;
  let levelCb: ((rms: number) => void) | undefined;

  processor.onaudioprocess = (e) => {
    if (paused) return;
    const input = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(input.length);
    copy.set(input);
    chunks.push(copy);
    // compute RMS + peak
    let sum = 0, localPeak = 0;
    for (let i = 0; i < input.length; i++) {
      const v = input[i];
      sum += v * v;
      const a = Math.abs(v);
      if (a > localPeak) localPeak = a;
      if (a >= CLIP_THRESHOLD) clipping = true;
    }
    const rms = Math.sqrt(sum / input.length);
    if (localPeak > peak) peak = localPeak;
    rmsSamples.push(rms);
    levelCb?.(rms);
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  const getElapsed = () => {
    const now = paused ? pausedAt : performance.now();
    return (now - started - pausedAccum) / 1000;
  };

  const stop = async () => {
    if (ownsStream) stream.getTracks().forEach((t) => t.stop());
    processor.disconnect();
    source.disconnect();
    const durationSeconds = getElapsed();
    const sampleRate = ctx.sampleRate;
    await ctx.close();

    // flatten
    const total = chunks.reduce((s, c) => s + c.length, 0);
    const flat = new Float32Array(total);
    let o = 0;
    for (const c of chunks) { flat.set(c, o); o += c.length; }

    // downsample to 16k mono
    const resampled = downsample(flat, sampleRate, TARGET_SAMPLE_RATE);
    const wav = encodeWav(resampled, TARGET_SAMPLE_RATE);

    const avgVolume = rmsSamples.length ? rmsSamples.reduce((s, v) => s + v, 0) / rmsSamples.length : 0;
    const silentFrames = rmsSamples.filter((v) => v < SILENCE_RMS).length;
    const silenceRatio = rmsSamples.length ? silentFrames / rmsSamples.length : 1;

    return {
      blob: new Blob([wav], { type: "audio/wav" }),
      metrics: { durationSeconds, avgVolume, peakVolume: peak, silenceRatio, rmsSamples: sampleReduce(rmsSamples, 200), clipping },
    };
  };

  return {
    stop,
    pause: () => { if (!paused) { paused = true; pausedAt = performance.now(); } },
    resume: () => { if (paused) { pausedAccum += performance.now() - pausedAt; paused = false; } },
    cancel: () => { if (ownsStream) stream.getTracks().forEach((t) => t.stop()); processor.disconnect(); source.disconnect(); ctx.close(); },
    onLevel: (cb) => { levelCb = cb; },
    getElapsed,
  };
}

function downsample(buffer: Float32Array, srcRate: number, dstRate: number): Float32Array {
  if (dstRate === srcRate) return buffer;
  const ratio = srcRate / dstRate;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  let idx = 0;
  let pos = 0;
  while (idx < newLen) {
    const nextPos = Math.round((idx + 1) * ratio);
    let sum = 0, count = 0;
    for (let i = pos; i < nextPos && i < buffer.length; i++) { sum += buffer[i]; count++; }
    result[idx] = count ? sum / count : 0;
    idx++; pos = nextPos;
  }
  return result;
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}
function writeStr(v: DataView, o: number, s: string) { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); }

function sampleReduce(arr: number[], n: number): number[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
}
