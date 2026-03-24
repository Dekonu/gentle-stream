import Link from "next/link";
import { redirect } from "next/navigation";
import { GameStatsReport } from "@/components/user/GameStatsReport";
import { getUserGameStats } from "@/lib/db/gameStats";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GameStatsPage() {
  let stats;
  if (process.env.AUTH_DISABLED === "1") {
    const userId = process.env.DEV_USER_ID ?? "dev-local";
    stats = await getUserGameStats(userId, 100);
  } else {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    stats = await getUserGameStats(user.id, 100);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1.5rem 1rem 3rem" }}>
      <div style={{ maxWidth: "800px", margin: "0 auto" }}>
        <nav style={{ marginBottom: "1.25rem" }}>
          <Link
            href="/"
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.88rem",
              color: "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "3px",
            }}
          >
            ← Back to feed
          </Link>
        </nav>
        <header style={{ marginBottom: "1.75rem" }}>
          <h1
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "clamp(1.5rem, 4vw, 2rem)",
              fontWeight: 700,
              color: "#1a1a1a",
              margin: 0,
              letterSpacing: "0.02em",
            }}
          >
            Game statistics
          </h1>
          <p
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              color: "#666",
              fontSize: "0.92rem",
              margin: "0.5rem 0 0",
            }}
          >
            Every completion records game type, difficulty, and duration.
          </p>
        </header>
        <GameStatsReport stats={stats} />
      </div>
    </div>
  );
}
