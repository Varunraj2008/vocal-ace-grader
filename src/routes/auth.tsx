import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Mic2 } from "lucide-react";
import { toast } from "sonner";
import { Nav } from "@/components/Nav";

const searchSchema = z.object({ next: z.string().optional() });

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Communication Assessment Platform" },
      { name: "description", content: "Sign in with Google to start your reading assessment." },
      { property: "og:title", content: "Sign in — Communication Assessment Platform" },
      { property: "og:description", content: "Sign in with Google to start your reading assessment." },
    ],
  }),
  validateSearch: (s) => searchSchema.parse(s),
  component: AuthPage,
});

function AuthPage() {
  const { next } = useSearch({ from: "/auth" });
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: (next as string) || "/assessment", replace: true });
    });
  }, [navigate, next]);

  const signInGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin + "/auth",
      });
      if (result.error) { toast.error(result.error.message ?? "Sign-in failed"); setLoading(false); return; }
      if (result.redirected) return;
      // Session set; navigate.
      navigate({ to: (next as string) || "/assessment", replace: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sign-in failed");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto flex min-h-[80vh] max-w-md items-center justify-center px-4">
        <Card className="w-full glass border-0 shadow-glow">
          <CardHeader className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-brand-foreground shadow-glow">
              <Mic2 className="h-6 w-6" />
            </div>
            <CardTitle className="mt-4 text-2xl">Welcome back</CardTitle>
            <CardDescription>Sign in with Google to start your assessment.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={signInGoogle} disabled={loading} className="w-full h-11 rounded-full bg-white text-slate-900 hover:bg-white/90 border">
              <GoogleIcon /> {loading ? "Signing in…" : "Continue with Google"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              By continuing, you agree to fair, honest assessments.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.7 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6.1C12.3 13.5 17.6 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.5 24.5c0-1.5-.1-3-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.9 7.2l7.6 5.9c4.4-4.1 7.1-10.1 7.1-17.6z"/>
      <path fill="#FBBC05" d="M10.3 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.5 10.7l7.8-6.1z"/>
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.6-5.9c-2.1 1.4-4.8 2.3-8.2 2.3-6.4 0-11.7-4-13.7-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
    </svg>
  );
}
