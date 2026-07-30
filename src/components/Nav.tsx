import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Mic2, LogOut, Trophy, User as UserIcon, Shield, Menu, Video } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

export function Nav() {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setUser(s?.user ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const { data: isAdmin } = useQuery({
    queryKey: ["isAdmin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user!.id);
      return !!data?.some((r) => r.role === "admin");
    },
  });

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const initials = (user?.user_metadata?.full_name || user?.email || "?")
    .split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-40 w-full glass border-b">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-gradient text-brand-foreground shadow-glow">
            <Mic2 className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Vocalis</span>
        </Link>

        <div className="hidden md:flex items-center gap-1">
          <NavLink to="/leaderboard" icon={<Trophy className="h-4 w-4" />}>Leaderboard</NavLink>
          {user && <NavLink to="/assessment" icon={<Mic2 className="h-4 w-4" />}>Assessment</NavLink>}
          {user && <NavLink to="/video-assessment" icon={<Video className="h-4 w-4" />}>Video</NavLink>}
          {user && <NavLink to="/profile" icon={<UserIcon className="h-4 w-4" />}>Profile</NavLink>}
          {isAdmin && <NavLink to="/admin" icon={<Shield className="h-4 w-4" />}>Admin</NavLink>}
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
                <DropdownMenuItem asChild><Link to="/profile"><UserIcon className="mr-2 h-4 w-4" />Profile</Link></DropdownMenuItem>
                {<DropdownMenuItem asChild><Link to="/assessment"><Mic2 className="mr-2 h-4 w-4" />New audio assessment</Link></DropdownMenuItem>}
                <DropdownMenuItem asChild><Link to="/video-assessment"><Video className="mr-2 h-4 w-4" />New video assessment</Link></DropdownMenuItem>
                {isAdmin && <DropdownMenuItem asChild><Link to="/admin"><Shield className="mr-2 h-4 w-4" />Admin</Link></DropdownMenuItem>}
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
            <DropdownMenuTrigger className="md:hidden rounded-full p-2 hover:bg-accent"><Menu className="h-5 w-5" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild><Link to="/leaderboard">Leaderboard</Link></DropdownMenuItem>
              {user && <DropdownMenuItem asChild><Link to="/assessment">Assessment</Link></DropdownMenuItem>}
              {user && <DropdownMenuItem asChild><Link to="/video-assessment">Video assessment</Link></DropdownMenuItem>}
              {user && <DropdownMenuItem asChild><Link to="/profile">Profile</Link></DropdownMenuItem>}
              {isAdmin && <DropdownMenuItem asChild><Link to="/admin">Admin</Link></DropdownMenuItem>}
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
