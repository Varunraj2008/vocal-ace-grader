import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminStats, adminProfileOverview } from "@/lib/admin.functions";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatRelative, APP_TIMEZONE } from "@/lib/datetime";
import { Users, ClipboardCheck, TrendingUp, Award, ShieldCheck, Activity, Building2 } from "lucide-react";
import type { User } from "@supabase/supabase-js";

/** Administrator profile — account details, org statistics, system info, activity. */
export function AdminProfile({ user }: { user: User | null }) {
  const statsFn = useServerFn(adminStats);
  const overviewFn = useServerFn(adminProfileOverview);

  const stats = useQuery({ queryKey: ["admin", "stats"], queryFn: () => statsFn() });
  const overview = useQuery({ queryKey: ["admin", "profile-overview"], queryFn: () => overviewFn() });

  const profile = overview.data?.profile;
  const name = profile?.full_name || user?.user_metadata?.full_name || user?.email || "Administrator";
  const email = profile?.email || user?.email || "—";
  const org = email.includes("@") ? email.split("@")[1] : "—";
  const initials = String(name).split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Card className="glass border-0">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <Avatar className="h-16 w-16">
            <AvatarImage src={profile?.avatar_url ?? user?.user_metadata?.avatar_url} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-lg font-semibold">{name}</span>
              <Badge className="border-0 bg-brand-gradient text-brand-foreground">
                <ShieldCheck className="mr-1 h-3 w-3" />Administrator
              </Badge>
            </div>
            <div className="truncate text-sm text-muted-foreground">{email}</div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Building2 className="h-3.5 w-3.5" />{org}
            </div>
          </div>
          <div className="grid gap-3 text-right text-xs text-muted-foreground sm:min-w-[220px]">
            <div>
              <div>Account created</div>
              <div className="text-sm font-medium text-foreground">{formatDateTime(profile?.created_at ?? user?.created_at)}</div>
            </div>
            <div>
              <div>Last login</div>
              <div className="text-sm font-medium text-foreground">{formatDateTime(user?.last_sign_in_at)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-3 text-lg font-semibold">Quick statistics</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Total users" value={stats.data?.totalUsers ?? "—"} icon={<Users className="h-4 w-4" />} />
          <Stat label="Completed assessments" value={stats.data?.completedSessions ?? "—"} icon={<ClipboardCheck className="h-4 w-4" />} />
          <Stat label="Average score" value={stats.data?.averageScore ? stats.data.averageScore.toFixed(1) : "—"} icon={<TrendingUp className="h-4 w-4" />} />
          <Stat
            label="Top performer"
            value={stats.data?.topPerformer ? `${stats.data.topPerformer.name ?? "—"} · ${stats.data.topPerformer.score.toFixed(1)}` : "—"}
            icon={<Award className="h-4 w-4" />}
            small
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="glass border-0">
          <CardContent className="space-y-3 p-6">
            <h2 className="text-lg font-semibold">System status</h2>
            <Row label="Backend" value={<span className="text-success">Operational</span>} />
            <Row label="Assessment engine" value={<span className="text-success">Operational</span>} />
            <Row label="Storage" value={<span className="text-success">Operational</span>} />
            <Row label="Timezone" value={`${APP_TIMEZONE} (IST)`} />
          </CardContent>
        </Card>

        <Card className="glass border-0">
          <CardContent className="space-y-3 p-6">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><Activity className="h-4 w-4" />Recent admin activity</h2>
            {(overview.data?.logs ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No recent activity.</p>
            ) : (
              <ul className="divide-y">
                {(overview.data?.logs ?? []).map((l: any) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="capitalize">{String(l.action).replace(/_/g, " ")}</span>
                    <span className="text-xs text-muted-foreground">{formatRelative(l.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function Stat({ label, value, icon, small }: { label: string; value: React.ReactNode; icon: React.ReactNode; small?: boolean }) {
  return (
    <Card className="glass border-0">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-gradient text-brand-foreground shadow-glow">{icon}</div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={`${small ? "truncate text-base" : "text-2xl"} font-bold`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
