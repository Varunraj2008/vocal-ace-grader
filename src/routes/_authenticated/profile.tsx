import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic2, Loader2, Trophy } from "lucide-react";
import { useRole } from "@/hooks/useRole";
import { AdminProfile } from "@/components/AdminProfile";
import { formatDateTime } from "@/lib/datetime";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Vocalis" },
      { name: "description", content: "Your assessment history and best score." },
      { property: "og:title", content: "Profile — Vocalis" },
      { property: "og:description", content: "Your assessment history and best score." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { user, isAdmin, isLoading } = useRole();

  if (isLoading) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-24 text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
      </main>
    );
  }

  // Role-based rendering: administrators never see participant components.
  return isAdmin ? <AdminProfile user={user} /> : <UserProfile userId={user?.id ?? null} user={user} />;
}

function UserProfile({ userId, user }: { userId: string | null; user: ReturnType<typeof useRole>["user"] }) {
  const { data: sessions } = useQuery({
    queryKey: ["profile", "sessions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("assessment_sessions")
        .select("id, status, overall_score, overall_grade, created_at, completed_at")
        .eq("user_id", userId!)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: rank } = useQuery({
    queryKey: ["profile", "rank", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_leaderboard", { _limit: 500 });
      const idx = ((data ?? []) as any[]).findIndex((r) => r.user_id === userId);
      return idx >= 0 ? { position: idx + 1, total: (data ?? []).length } : null;
    },
  });

  const completed = (sessions ?? []).filter((s) => s.status === "completed");
  const best = completed.reduce((m, s) => Math.max(m, Number(s.overall_score ?? 0)), 0);
  const initials = (user?.user_metadata?.full_name || user?.email || "?").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-10">
      <Card className="glass border-0">
        <CardContent className="flex items-center gap-4 p-6">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.user_metadata?.avatar_url} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold">{user?.user_metadata?.full_name || user?.email}</div>
            <div className="truncate text-sm text-muted-foreground">{user?.email}</div>
            <div className="mt-1 text-xs text-muted-foreground">Joined {formatDateTime(user?.created_at)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Best score</div>
            <div className="text-gradient text-3xl font-bold">{best ? best.toFixed(1) : "—"}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Assessments" value={sessions?.length ?? 0} />
        <MiniStat label="Completed" value={completed.length} />
        <MiniStat
          label="Leaderboard position"
          value={rank ? `#${rank.position} of ${rank.total}` : "—"}
          icon={<Trophy className="h-4 w-4 text-muted-foreground" />}
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your assessments</h2>
        <Button asChild size="sm" className="rounded-full bg-brand-gradient text-brand-foreground">
          <Link to="/assessment"><Mic2 className="mr-2 h-4 w-4" />New assessment</Link>
        </Button>
      </div>

      <Card className="glass border-0">
        <CardContent className="p-0">
          {(!sessions || sessions.length === 0) ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No assessments yet.</div>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{formatDateTime(s.created_at)}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.status === "completed" ? `Completed ${formatDateTime(s.completed_at, "")}` : `Status: ${s.status}`}
                    </div>
                  </div>
                  {s.status === "completed" ? (
                    <>
                      <Badge className="border-0 bg-brand-gradient text-brand-foreground">{Number(s.overall_score).toFixed(1)} · {s.overall_grade}</Badge>
                      <Button asChild variant="outline" size="sm" className="rounded-full"><Link to="/results/$sessionId" params={{ sessionId: s.id }}>View</Link></Button>
                    </>
                  ) : (
                    <Badge variant="secondary" className="capitalize">{s.status}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function MiniStat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="glass border-0">
      <CardContent className="p-5">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
        <div className="mt-1 text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
