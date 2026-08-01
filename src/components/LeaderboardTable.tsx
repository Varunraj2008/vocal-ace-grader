import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ChevronRight as Chevron } from "lucide-react";

export type LeaderboardRow = {
  session_id: string | null;
  user_id: string | null;
  full_name: string | null;
  avatar_url: string | null;
  overall_score: number | null;
  overall_grade: string | null;
  completed_at: string | null;
  accuracy?: number | null;
  fluency?: number | null;
};

type SortKey = "rank" | "name" | "score" | "accuracy" | "fluency" | "date";

const PAGE_SIZE = 10;
const MEDALS = ["🥇", "🥈", "🥉"];

/** Live leaderboard used by both the public page and the admin console. */
export function LeaderboardTable({ onRowClick }: { onRowClick?: (row: LeaderboardRow) => void }) {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("rank");
  const [asc, setAsc] = useState(false);
  const [page, setPage] = useState(0);

  const load = async () => {
    const { data } = await supabase.rpc("get_leaderboard", { _limit: 200 });
    const base = ((data ?? []) as unknown as LeaderboardRow[]).slice();
    const ids = base.map((r) => r.session_id).filter(Boolean) as string[];
    if (ids.length) {
      const { data: sessions } = await supabase
        .from("assessment_sessions")
        .select("id, breakdown")
        .in("id", ids);
      const byId = new Map((sessions ?? []).map((s) => [s.id, (s.breakdown ?? {}) as Record<string, number>]));
      for (const r of base) {
        const b = r.session_id ? byId.get(r.session_id) : undefined;
        r.accuracy = b?.accuracy ?? null;
        r.fluency = b?.fluency ?? null;
      }
    }
    setRows(base);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const ch = supabase
      .channel("leaderboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_sessions" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  // Ranks are assigned on the score-ordered source list, so they never change with sorting.
  const ranked = useMemo(
    () => rows.map((r, i) => ({ ...r, rank: i + 1 })),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? ranked.filter((r) => (r.full_name ?? "").toLowerCase().includes(needle))
      : ranked;
    const dir = asc ? 1 : -1;
    const sorted = list.slice().sort((a, b) => {
      switch (sort) {
        case "name": return (a.full_name ?? "").localeCompare(b.full_name ?? "") * (asc ? 1 : -1);
        case "score": return ((a.overall_score ?? 0) - (b.overall_score ?? 0)) * dir;
        case "accuracy": return ((a.accuracy ?? 0) - (b.accuracy ?? 0)) * dir;
        case "fluency": return ((a.fluency ?? 0) - (b.fluency ?? 0)) * dir;
        case "date": return (new Date(a.completed_at ?? 0).getTime() - new Date(b.completed_at ?? 0).getTime()) * dir;
        default: return (a.rank - b.rank) * (asc ? 1 : -1) * -1;
      }
    });
    return sorted;
  }, [ranked, q, sort, asc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setAsc((v) => !v);
    else { setSort(key); setAsc(key === "name"); }
    setPage(0);
  };

  const Th = ({ label, k, className = "" }: { label: string; k: SortKey; className?: string }) => (
    <th className={`py-2 font-medium ${className}`}>
      <button
        onClick={() => toggleSort(k)}
        className="inline-flex items-center gap-1 transition hover:text-foreground"
      >
        {label}
        <ArrowUpDown className={`h-3 w-3 ${sort === k ? "text-foreground" : "opacity-40"}`} />
      </button>
    </th>
  );

  return (
    <Card className="glass border-0">
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(0); }}
            placeholder="Search by student name…"
            className="rounded-full pl-9"
          />
        </div>

        {loading ? (
          <div className="p-10 text-center text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {rows.length ? "No students match your search." : "No assessments have been completed yet."}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr className="border-b">
                    <Th label="Rank" k="rank" className="w-20" />
                    <Th label="Student" k="name" />
                    <Th label="Overall" k="score" className="text-right" />
                    <Th label="Accuracy" k="accuracy" className="text-right" />
                    <Th label="Fluency" k="fluency" className="text-right" />
                    <Th label="Date" k="date" className="text-right" />
                    {onRowClick && <th className="w-8" />}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {visible.map((r) => {
                    const medal = r.rank <= 3 ? MEDALS[r.rank - 1] : null;
                    return (
                      <tr
                        key={r.session_id ?? r.user_id ?? r.rank}
                        onClick={onRowClick ? () => onRowClick(r) : undefined}
                        className={`transition ${onRowClick ? "cursor-pointer hover:bg-accent/60" : ""}`}
                      >
                        <td className="py-3">
                          <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${
                            r.rank === 1 ? "bg-brand-gradient text-brand-foreground shadow-glow"
                              : r.rank <= 3 ? "bg-accent" : "border"
                          }`}>
                            {medal ?? r.rank}
                          </span>
                        </td>
                        <td className="py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={r.avatar_url ?? undefined} alt="" />
                              <AvatarFallback>{(r.full_name ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="truncate font-medium">{r.full_name ?? "Anonymous"}</div>
                              <div className="text-xs text-muted-foreground">Grade {r.overall_grade ?? "—"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-right">
                          <Badge className="border-0 bg-brand-gradient text-brand-foreground">
                            {r.overall_score != null ? Number(r.overall_score).toFixed(1) : "—"}
                          </Badge>
                        </td>
                        <td className="py-3 text-right tabular-nums">{r.accuracy != null ? Number(r.accuracy).toFixed(1) : "—"}</td>
                        <td className="py-3 text-right tabular-nums">{r.fluency != null ? Number(r.fluency).toFixed(1) : "—"}</td>
                        <td className="py-3 text-right text-muted-foreground">
                          {r.completed_at ? new Date(r.completed_at).toLocaleDateString() : "—"}
                        </td>
                        {onRowClick && (
                          <td className="py-3 text-right text-muted-foreground"><Chevron className="h-4 w-4" /></td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between pt-1 text-sm text-muted-foreground">
              <span>
                Showing {current * PAGE_SIZE + 1}–{Math.min(filtered.length, (current + 1) * PAGE_SIZE)} of {filtered.length}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" disabled={current === 0} onClick={() => setPage(current - 1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">Page {current + 1} / {pageCount}</span>
                <Button variant="outline" size="icon" className="h-8 w-8 rounded-full" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
