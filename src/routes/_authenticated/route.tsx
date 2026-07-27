// Integration-managed protected layout: gates the subtree client-side.
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Nav } from "@/components/Nav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { next: location.href } });
    }
    return { user: data.user };
  },
  component: Layout,
});

function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <Outlet />
    </div>
  );
}
