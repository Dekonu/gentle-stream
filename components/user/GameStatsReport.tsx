import type { UserGameStats } from "@/lib/types";

const DIFF_ORDER = ["easy", "medium", "hard"];

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function sortDifficulties(keys: string[]): string[] {
  const ordered: string[] = [];
  for (const d of DIFF_ORDER) if (keys.includes(d)) ordered.push(d);
  const rest = keys.filter((k) => !DIFF_ORDER.includes(k)).sort();
  return [...ordered, ...rest];
}

function formatGameLabel(type: string): string {
  return type.replace(/_/g, " ");
}

function formatCompletedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

interface GameStatsReportProps {
  stats: UserGameStats;
}

export function GameStatsReport({ stats }: GameStatsReportProps) {
  const typeKeys = Object.keys(stats.byType).sort();

  return (
    <div style={{ maxWidth: "720px", margin: "0 auto" }}>
      <section
        style={{
          marginBottom: "2rem",
          padding: "1.25rem 1.5rem",
          background: "#fff",
          border: "1px solid #d4cfc4",
        }}
      >
        <h2
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.72rem",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "#666",
            margin: "0 0 0.75rem",
          }}
        >
          Overview
        </h2>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "1.5rem",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "1rem",
            color: "#333",
          }}
        >
          <div>
            <div style={{ fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Puzzles finished
            </div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.85rem", fontWeight: 700 }}>
              {stats.totalCompletions}
            </div>
          </div>
          <div>
            <div style={{ fontSize: "0.7rem", color: "#888", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Total time
            </div>
            <div style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.85rem", fontWeight: 700 }}>
              {formatDuration(stats.totalSecondsPlayed)}
            </div>
          </div>
        </div>
      </section>

      {stats.totalCompletions === 0 ? (
        <p
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            color: "#999",
            fontSize: "1rem",
          }}
        >
          Complete a puzzle in your feed to see breakdowns here.
        </p>
      ) : (
        <>
          <section style={{ marginBottom: "2rem" }}>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#666",
                margin: "0 0 0.85rem",
              }}
            >
              By game and difficulty
            </h2>
            <p
              style={{
                fontFamily: "'IM Fell English', Georgia, serif",
                fontSize: "0.82rem",
                color: "#777",
                margin: "0 0 1rem",
                lineHeight: 1.45,
              }}
            >
              Each finish is stored with its difficulty (easy, medium, or hard).
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {typeKeys.map((gameType) => {
                const byDiff = stats.byTypeAndDifficulty[gameType] ?? {};
                const diffKeys = sortDifficulties(Object.keys(byDiff));
                return (
                  <div
                    key={gameType}
                    style={{
                      border: "1px solid #d4cfc4",
                      background: "#fff",
                      padding: "1rem 1.15rem",
                    }}
                  >
                    <h3
                      style={{
                        fontFamily: "'Playfair Display', Georgia, serif",
                        fontSize: "1.05rem",
                        margin: "0 0 0.65rem",
                        textTransform: "capitalize",
                      }}
                    >
                      {formatGameLabel(gameType)}
                    </h3>
                    <table
                      style={{
                        width: "100%",
                        borderCollapse: "collapse",
                        fontFamily: "'IM Fell English', Georgia, serif",
                        fontSize: "0.88rem",
                      }}
                    >
                      <thead>
                        <tr style={{ borderBottom: "1px solid #e8e4dc", textAlign: "left", color: "#888" }}>
                          <th style={{ padding: "0.35rem 0.25rem 0.5rem 0", fontWeight: 600 }}>Difficulty</th>
                          <th style={{ padding: "0.35rem 0.25rem 0.5rem 0", fontWeight: 600 }}>Completed</th>
                          <th style={{ padding: "0.35rem 0.25rem 0.5rem 0", fontWeight: 600 }}>Avg time</th>
                          <th style={{ padding: "0.35rem 0.25rem 0.5rem 0", fontWeight: 600 }}>Total time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {diffKeys.map((d) => {
                          const b = byDiff[d]!;
                          return (
                            <tr key={d} style={{ borderBottom: "1px solid #f2efe8" }}>
                              <td style={{ padding: "0.45rem 0.25rem", textTransform: "capitalize" }}>{d}</td>
                              <td style={{ padding: "0.45rem 0.25rem" }}>{b.completions}</td>
                              <td style={{ padding: "0.45rem 0.25rem" }}>{formatDuration(b.avgSeconds)}</td>
                              <td style={{ padding: "0.45rem 0.25rem" }}>{formatDuration(b.totalSeconds)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2
              style={{
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.72rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "#666",
                margin: "0 0 0.85rem",
              }}
            >
              Recent finishes
            </h2>
            <div
              style={{
                border: "1px solid #d4cfc4",
                background: "#fff",
                overflowX: "auto",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.82rem",
                }}
              >
                <thead>
                  <tr style={{ borderBottom: "1px solid #e8e4dc", textAlign: "left", color: "#888" }}>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>When</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Game</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Difficulty</th>
                    <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600 }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((r, i) => (
                    <tr key={`${r.completedAt}-${i}`} style={{ borderBottom: "1px solid #f2efe8" }}>
                      <td style={{ padding: "0.45rem 0.75rem", whiteSpace: "nowrap" }}>
                        {formatCompletedAt(r.completedAt)}
                      </td>
                      <td style={{ padding: "0.45rem 0.75rem", textTransform: "capitalize" }}>
                        {formatGameLabel(r.gameType)}
                      </td>
                      <td style={{ padding: "0.45rem 0.75rem", textTransform: "capitalize" }}>{r.difficulty}</td>
                      <td style={{ padding: "0.45rem 0.75rem" }}>{formatDuration(r.durationSeconds)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
