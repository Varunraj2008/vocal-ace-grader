import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useRole } from "@/hooks/useRole";
import { Loader2, LayoutDashboard, Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

/** Role gate: only admins may see anything under /admin. */
function AdminLayout() {
  const { isAdmin, isLoading } = useRole();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate({ to: "/leaderboard", replace: true });
  }, [isAdmin, isLoading, navigate]);

  if (isLoading || !isAdmin) {
    return (
      <main className="grid min-h-[60vh] place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    );
  }

  return (
    <div>
      <div className="border-b">
        <div className="mx-auto flex max-w-6xl items-center gap-1 px-4 py-2">
          <TabLink to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</TabLink>
          <TabLink to="/admin/leaderboard" icon={<Trophy className="h-4 w-4" />}>Leaderboard</TabLink>
        </div>
      </div>
      <Outlet />
    </div>
  );
}

function TabLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      activeOptions={{ exact: true }}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
    >
      {icon}{children}
    </Link>
  );
}
