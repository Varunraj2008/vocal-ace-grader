import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminGetStudent, adminDeleteSession } from "@/lib/admin.functions";
import { AssessmentReport } from "@/components/AssessmentReport";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, ArrowLeft, Trash2, Mail, CalendarDays, Building2, Medal } from "lucide-react";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/datetime";

const searchSchema = z.object({ session: z.string().optional() });

export const Route = createFileRoute("/_authenticated/admin/student/$studentId")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Student assessment details — Vocalis Admin" },
      { name: "description", content: "Full communication assessment breakdown, transcripts, and audio for a student." },
      { property: "og:title", content: "Student assessment details — Vocalis Admin" },
      { property: "og:description", content: "Full assessment breakdown, transcripts, and audio for a student." },
    ],
  }),
  component: StudentDetailPage,
});

function StudentDetailPage() {
  const { studentId } = Route.useParams();
  const { session } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const getStudent = useServerFn(adminGetStudent);
  const deleteSession = useServerFn(adminDeleteSession);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "student", studentId, session ?? null],
    queryFn: () => getStudent({ data: { studentId, sessionId: session } }),
  });

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-24 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-muted-foreground">Loading student assessment…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-24 text-center text-destructive">
        {error instanceof Error ? error.message : "Unable to load this student."}
      </main>
    );
  }

  const { profile, history, rank, totalRanked, detail, selectedId } = data as any;
  const active = detail?.session;
  const department = profile.department ?? profile.email?.split("@")[1] ?? "—";

  const onDelete = async () => {
    if (!selectedId) return;
    try {
      await deleteSession({ data: { sessionId: selectedId } });
      toast.success("Assessment deleted");
      await qc.invalidateQueries({ queryKey: ["admin"] });
      navigate({ to: "/admin/leaderboard" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <Button asChild variant="ghost" size="sm" className="-ml-2 rounded-full print:hidden">
        <Link to="/admin/leaderboard"><ArrowLeft className="mr-2 h-4 w-4" />Back to leaderboard</Link>
      </Button>

      {/* Student header */}
      <Card className="glass border-0">
        <CardContent className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-20 w-20 shadow-glow">
            <AvatarImage src={profile.avatar_url ?? undefined} alt={profile.full_name ?? "Student"} />
            <AvatarFallback className="text-lg">{(profile.full_name ?? profile.email ?? "?").slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-1">
            <h1 className="truncate text-2xl font-bold">{profile.full_name ?? "Unnamed student"}</h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{profile.email ?? "—"}</span>
              <span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />{department}</span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                {active?.completed_at ? formatDateTime(active.completed_at) : "No completed assessment"}
              </span>
            </div>
          </div>

          <div className="flex gap-3">
            <HeaderStat label="Overall" value={active?.overall_score != null ? Number(active.overall_score).toFixed(1) : "—"} highlight />
            <HeaderStat label="Grade" value={active?.overall_grade ?? "—"} />
            <HeaderStat label="Rank" value={rank ? `#${rank}` : "—"} sub={rank ? `of ${totalRanked}` : undefined} icon={<Medal className="h-3.5 w-3.5" />} />
          </div>
        </CardContent>
      </Card>

      {/* Assessment history */}
      {history.length > 0 && (
        <Card className="glass border-0 print:hidden">
          <CardContent className="p-4">
            <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Assessment history</div>
            <div className="flex flex-wrap gap-2">
              {history.map((h: any) => (
                <button
                  key={h.id}
                  onClick={() => navigate({ to: ".", search: { session: h.id }, replace: true })}
                  className={`rounded-full border px-3 py-1.5 text-xs transition hover:bg-accent ${
                    h.id === selectedId ? "border-transparent bg-brand-gradient text-brand-foreground shadow-glow" : ""
                  }`}
                >
                  {h.completed_at ? formatDateTime(h.completed_at) : "In progress"} ·{" "}
                  {h.overall_score != null ? Number(h.overall_score).toFixed(1) : h.status}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!detail || !active ? (
        <Card className="glass border-0">
          <CardContent className="p-12 text-center text-muted-foreground">
            This student has not completed an assessment yet.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Badge variant="secondary" className="capitalize">{active.status}</Badge>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="ml-auto rounded-full">
                  <Trash2 className="mr-2 h-4 w-4" />Delete assessment
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this assessment?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes the session, its recordings, transcripts, audio files, and scores.
                    This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Delete permanently</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>

          <AssessmentReport
            admin
            studentName={profile.full_name ?? profile.email ?? "Student"}
            data={{
              session: active,
              recordings: detail.recordings ?? [],
              transcripts: detail.transcripts ?? [],
              analyses: detail.analyses ?? [],
              paragraphs: detail.paragraphs ?? [],
              audioUrls: detail.signedUrls ?? [],
            }}
          />
        </>
      )}
    </main>
  );
}

function HeaderStat({ label, value, sub, highlight, icon }: {
  label: string; value: React.ReactNode; sub?: string; highlight?: boolean; icon?: React.ReactNode;
}) {
  return (
    <div className={`min-w-24 rounded-2xl border px-4 py-3 text-center ${highlight ? "border-transparent bg-brand-gradient text-brand-foreground shadow-glow" : ""}`}>
      <div className={`inline-flex items-center gap-1 text-[11px] ${highlight ? "opacity-90" : "text-muted-foreground"}`}>{icon}{label}</div>
      <div className="text-xl font-bold tabular-nums">{value}</div>
      {sub && <div className={`text-[11px] ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{sub}</div>}
    </div>
  );
}
