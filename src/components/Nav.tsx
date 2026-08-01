import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mic2, LogOut, Trophy, User as UserIcon, LayoutDashboard, Menu } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRole } from "@/hooks/useRole";

export function Nav() {
  const { user, isAdmin } = useRole();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const initials = (user?.user_metadata?.full_name || user?.email || "?")
    .split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  // Admins never see assessment-taking navigation.
  const showAssessment = !!user && !isAdmin;

  return (
    <header className="sticky top-0 z-40 w-full glass border-b print:hidden">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-gradient text-brand-foreground shadow-glow">
            <Mic2 className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Vocalis</span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {isAdmin && <NavLink to="/admin" icon={<LayoutDashboard className="h-4 w-4" />}>Dashboard</NavLink>}
          <NavLink to="/leaderboard" icon={<Trophy className="h-4 w-4" />}>Leaderboard</NavLink>
          {showAssessment && <NavLink to="/assessment" icon={<Mic2 className="h-4 w-4" />}>Assessment</NavLink>}
          {user && <NavLink to="/profile" icon={<UserIcon className="h-4 w-4" />}>Profile</NavLink>}
        </div>

        <div className="flex items-center gap-2">
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger className="rounded-full outline-none focus:ring-2 focus:ring-ring">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={user.user_metadata?.avatar_url} />
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><LayoutDashboard className="mr-2 h-4 w-4" />Dashboard</Link></DropdownMenuItem>}
                <DropdownMenuItem asChild><Link to="/leaderboard"><Trophy className="mr-2 h-4 w-4" />Leaderboard</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="mr-2 h-4 w-4" />Profile</Link></DropdownMenuItem>
                {showAssessment && <DropdownMenuItem asChild><Link to="/assessment"><Mic2 className="mr-2 h-4 w-4" />New assessment</Link></DropdownMenuItem>}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut}><LogOut className="mr-2 h-4 w-4" />Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="rounded-full bg-brand-gradient text-brand-foreground shadow-glow hover:opacity-90">
              <Link to="/auth">Sign in</Link>
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full p-2 hover:bg-accent md:hidden"><Menu className="h-5 w-5" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isAdmin && <DropdownMenuItem asChild><Link to="/admin">Dashboard</Link></DropdownMenuItem>}
              <DropdownMenuItem asChild><Link to="/leaderboard">Leaderboard</Link></DropdownMenuItem>
              {showAssessment && <DropdownMenuItem asChild><Link to="/assessment">Assessment</Link></DropdownMenuItem>}
              {user && <DropdownMenuItem asChild><Link to="/profile">Profile</Link></DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>
    </header>
  );
}

function NavLink({ to, icon, children }: { to: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground data-[status=active]:bg-accent data-[status=active]:text-foreground"
    >
      {icon}{children}
    </Link>
  );
}
