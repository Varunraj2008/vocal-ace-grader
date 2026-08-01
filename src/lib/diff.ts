// Word-level alignment between a reference paragraph and an AI transcript,
// used to highlight reading errors in the assessment report.

export type DiffToken = {
  text: string;
  kind: "match" | "wrong" | "missing" | "extra";
};

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");

/**
 * Levenshtein alignment over word arrays. Returns tokens in reference order
 * with substitutions/deletions marked, plus trailing insertions from the transcript.
 */
export function diffWords(reference: string, transcript: string): DiffToken[] {
  const ref = reference.trim().split(/\s+/).filter(Boolean);
  const hyp = transcript.trim().split(/\s+/).filter(Boolean);
  const m = ref.length;
  const n = hyp.length;
  if (!m) return hyp.map((text) => ({ text, kind: "extra" as const }));
  if (!n) return ref.map((text) => ({ text, kind: "missing" as const }));

  // Cap the matrix for very long inputs to keep the UI responsive.
  if (m * n > 400_000) return ref.map((text) => ({ text, kind: "match" as const }));

  const d: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = norm(ref[i - 1]) === norm(hyp[j - 1]) ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }

  const out: DiffToken[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0) {
      const cost = norm(ref[i - 1]) === norm(hyp[j - 1]) ? 0 : 1;
      if (d[i][j] === d[i - 1][j - 1] + cost) {
        out.push({ text: ref[i - 1], kind: cost === 0 ? "match" : "wrong" });
        i--; j--;
        continue;
      }
    }
    if (i > 0 && d[i][j] === d[i - 1][j] + 1) {
      out.push({ text: ref[i - 1], kind: "missing" });
      i--;
      continue;
    }
    out.push({ text: hyp[j - 1], kind: "extra" });
    j--;
  }
  return out.reverse();
}

export function diffSummary(tokens: DiffToken[]) {
  const total = tokens.filter((t) => t.kind !== "extra").length || 1;
  const wrong = tokens.filter((t) => t.kind === "wrong").length;
  const missing = tokens.filter((t) => t.kind === "missing").length;
  const extra = tokens.filter((t) => t.kind === "extra").length;
  const matched = tokens.filter((t) => t.kind === "match").length;
  return {
    total,
    wrong,
    missing,
    extra,
    matched,
    completion: Math.round((matched / total) * 100),
  };
}
