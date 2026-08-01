import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminStats, adminListUsers } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { Users, Award, ClipboardCheck, TrendingUp, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — Vocalis" },
      { name: "description", content: "Organization admin dashboard for communication assessments and students." },
      { property: "og:title", content: "Admin dashboard — Vocalis" },
      { property: "og:description", content: "Organization admin dashboard for assessments and students." },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const stats = useServerFn(adminStats);
  const listUsers = useServerFn(adminListUsers);
  const navigate = useNavigate();
  const [q, setQ] = useState("");

  const s = useQuery({ queryKey: ["admin", "stats"], queryFn: () => stats() });
  const u = useQuery({ queryKey: ["admin", "users", q], queryFn: () => listUsers({ data: { search: q || undefined } }) });

  if (s.error) {
    return <main className="mx-auto max-w-4xl px-4 py-24 text-center text-destructive">{s.error instanceof Error ? s.error.message : "Access denied"}</main>;
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold">Admin dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of assessments across your organization.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Users" value={s.data?.totalUsers ?? "—"} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Sessions" value={s.data?.totalSessions ?? "—"} icon={<ClipboardCheck className="h-4 w-4" />} />
        <StatCard label="Average score" value={s.data?.averageScore ? s.data.averageScore.toFixed(1) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Top score" value={s.data?.highestScore ? Number(s.data.highestScore).toFixed(1) : "—"} icon={<Award className="h-4 w-4" />} />
      </div>

      <Card className="glass border-0">
        <CardContent className="space-y-3 p-4">
          <Input placeholder="Search by email…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-full" />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">User</th><th>Email</th><th>Sessions</th><th>Best</th><th>Last completed</th><th className="w-8" /></tr>
              </thead>
              <tbody className="divide-y">
                {(u.data ?? []).map((row: any) => (
                  <tr
                    key={row.id}
                    onClick={() => navigate({ to: "/admin/student/$studentId", params: { studentId: row.id } })}
                    className="cursor-pointer transition hover:bg-accent/60"
                  >
                    <td className="py-2">{row.full_name ?? "—"}</td>
                    <td className="text-muted-foreground">{row.email}</td>
                    <td>{row.stats.count}</td>
                    <td>{row.stats.best ? <Badge className="border-0 bg-brand-gradient text-brand-foreground">{Number(row.stats.best).toFixed(1)}</Badge> : "—"}</td>
                    <td className="text-muted-foreground">{row.stats.last ? new Date(row.stats.last).toLocaleString() : "—"}</td>
                    <td className="text-muted-foreground"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                ))}
                {(u.data ?? []).length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No users found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

function StatCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="glass border-0">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-brand-gradient text-brand-foreground shadow-glow">{icon}</div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
