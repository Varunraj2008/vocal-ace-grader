import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { User } from "@supabase/supabase-js";
import { Mic2 } from "lucide-react";

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
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setUser(data.user)); }, []);

  const { data: sessions } = useQuery({
    queryKey: ["profile", "sessions", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("assessment_sessions")
        .select("id, status, overall_score, overall_grade, created_at, completed_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const best = (sessions ?? []).filter((s) => s.status === "completed").reduce((m, s) => Math.max(m, Number(s.overall_score ?? 0)), 0);
  const initials = (user?.user_metadata?.full_name || user?.email || "?").split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 space-y-6">
      <Card className="glass border-0">
        <CardContent className="p-6 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={user?.user_metadata?.avatar_url} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold truncate">{user?.user_metadata?.full_name || user?.email}</div>
            <div className="text-sm text-muted-foreground truncate">{user?.email}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Best score</div>
            <div className="text-3xl font-bold text-gradient">{best ? best.toFixed(1) : "—"}</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your assessments</h2>
        <Button asChild size="sm" className="rounded-full bg-brand-gradient text-brand-foreground"><Link to="/assessment"><Mic2 className="mr-2 h-4 w-4" />New assessment</Link></Button>
      </div>

      <Card className="glass border-0">
        <CardContent className="p-0">
          {(!sessions || sessions.length === 0) ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No assessments yet.</div>
          ) : (
            <ul className="divide-y">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-4 p-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{new Date(s.created_at).toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {s.status === "completed" ? `Completed ${s.completed_at ? new Date(s.completed_at).toLocaleString() : ""}` : `Status: ${s.status}`}
                    </div>
                  </div>
                  {s.status === "completed" ? (
                    <>
                      <Badge className="bg-brand-gradient text-brand-foreground border-0">{Number(s.overall_score).toFixed(1)} · {s.overall_grade}</Badge>
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
