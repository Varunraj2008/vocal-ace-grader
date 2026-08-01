import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { LeaderboardTable } from "@/components/LeaderboardTable";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/leaderboard")({
  head: () => ({
    meta: [
      { title: "Student leaderboard — Vocalis Admin" },
      { name: "description", content: "Ranked students with accuracy and fluency — click a row to inspect the full assessment." },
      { property: "og:title", content: "Student leaderboard — Vocalis Admin" },
      { property: "og:description", content: "Ranked students with accuracy and fluency scores." },
    ],
  }),
  component: AdminLeaderboardPage,
});

function AdminLeaderboardPage() {
  const navigate = useNavigate();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-brand-gradient text-brand-foreground shadow-glow">
          <Trophy className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-3xl font-bold">Student leaderboard</h1>
        <p className="text-sm text-muted-foreground">Select a student to open their full assessment report.</p>
      </div>

      <LeaderboardTable
        onRowClick={(row) => {
          if (!row.user_id) return;
          navigate({
            to: "/admin/student/$studentId",
            params: { studentId: row.user_id },
            search: row.session_id ? { session: row.session_id } : {},
          });
        }}
      />
    </main>
  );
}
