import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Nav } from "@/components/Nav";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { useRole } from "@/hooks/useRole";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — Vocalis" },
      { name: "description", content: "Live leaderboard of top communicators in your organization." },
      { property: "og:title", content: "Leaderboard — Vocalis" },
      { property: "og:description", content: "Live leaderboard of top communicators." },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { isAdmin } = useRole();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-8 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-brand-foreground shadow-glow">
            <Trophy className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-3xl font-bold">Leaderboard</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? "Select a student to inspect their full assessment report." : "Ranked by highest-scoring completed assessment."}
          </p>
        </div>

        <LeaderboardTable
          onRowClick={
            isAdmin
              ? (row) => {
                  if (!row.user_id) return;
                  navigate({
                    to: "/admin/student/$studentId",
                    params: { studentId: row.user_id },
                    search: row.session_id ? { session: row.session_id } : {},
                  });
                }
              : undefined
          }
        />
      </main>
    </div>
  );
}
