"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Difficulty, RabbitHolePuzzle } from "@/lib/games/types";

interface RabbitHoleCardProps {
  puzzle: RabbitHolePuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
  metricsEnabled?: boolean;
  puzzleSignature?: string;
}

interface DesignModeOption {
  id: "neon-trail" | "archive-desk" | "signal-map";
  label: string;
  description: string;
}

const DESIGN_MODES: DesignModeOption[] = [
  {
    id: "neon-trail",
    label: "Neon Trail",
    description: "Arcade pulse links with glowing lure badges.",
  },
  {
    id: "archive-desk",
    label: "Archive Desk",
    description: "Editorial notes + stamps + dossier style.",
  },
  {
    id: "signal-map",
    label: "Signal Map",
    description: "Depth-linked mission map with branch paths.",
  },
];

function modeFromSeed(seed: string): DesignModeOption["id"] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return DESIGN_MODES[hash % DESIGN_MODES.length]!.id;
}

export default function RabbitHoleCard({
  puzzle,
  onNewPuzzle,
  metricsEnabled = true,
  puzzleSignature,
}: RabbitHoleCardProps) {
  const [designMode, setDesignMode] = useState<DesignModeOption["id"]>(
    modeFromSeed(puzzle.uniquenessSignature ?? puzzle.topic)
  );
  const [visitedLinks, setVisitedLinks] = useState<Record<string, boolean>>({});
  const completionLoggedRef = useRef(false);

  const visitedCount = useMemo(
    () => Object.values(visitedLinks).filter(Boolean).length,
    [visitedLinks]
  );

  useEffect(() => {
    setDesignMode(modeFromSeed(puzzle.uniquenessSignature ?? puzzle.topic));
    setVisitedLinks({});
    completionLoggedRef.current = false;
  }, [puzzle.uniquenessSignature, puzzle.topic]);

  useEffect(() => {
    if (!metricsEnabled) return;
    if (visitedCount < puzzle.links.length) return;
    if (completionLoggedRef.current) return;

    completionLoggedRef.current = true;
    const durationSeconds = Math.max(5, visitedCount * 8);
    void fetch("/api/user/game-completion", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameType: "rabbit_hole",
        difficulty: puzzle.difficulty,
        durationSeconds,
        metadata: {
          visitedCount,
          totalLinks: puzzle.links.length,
          puzzleSignature,
        },
      }),
    });
  }, [
    metricsEnabled,
    puzzle.difficulty,
    puzzle.links.length,
    puzzleSignature,
    visitedCount,
  ]);

  function markVisited(linkHref: string) {
    setVisitedLinks((prev) => ({ ...prev, [linkHref]: true }));
  }

  const wrapperStyle: React.CSSProperties = {
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    background:
      designMode === "neon-trail"
        ? "linear-gradient(160deg, #090312 0%, #1f0938 52%, #0e1b34 100%)"
        : designMode === "archive-desk"
          ? "linear-gradient(180deg, #f8f2e6 0%, #efe3d0 100%)"
          : "linear-gradient(180deg, #f2f6ff 0%, #deebff 100%)",
    color: designMode === "neon-trail" ? "#f5f3ff" : "#1a1a1a",
    padding: "1.1rem 1.15rem 1rem",
    display: "flex",
    flexDirection: "column",
    gap: "0.8rem",
  };

  return (
    <section style={wrapperStyle}>
      <header style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: "0.7rem", flexWrap: "wrap" }}>
          <span
            style={{
              fontFamily: "'Playfair Display', Georgia, serif",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              fontSize: "0.68rem",
              opacity: 0.9,
            }}
          >
            Wiki Rabbit Hole
          </span>
          <span
            style={{
              fontFamily: "'IM Fell English', Georgia, serif",
              fontStyle: "italic",
              fontSize: "0.74rem",
              opacity: 0.85,
            }}
          >
            Difficulty: {puzzle.difficulty}
          </span>
        </div>
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.22rem",
            lineHeight: 1.2,
            color: designMode === "neon-trail" ? "#f5d6ff" : "#1a1a1a",
          }}
        >
          {puzzle.topic}
        </h3>
        <p
          style={{
            margin: 0,
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.83rem",
            fontStyle: "italic",
            opacity: 0.86,
          }}
        >
          {puzzle.mission}
        </p>
      </header>

      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {DESIGN_MODES.map((mode) => {
          const active = mode.id === designMode;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => setDesignMode(mode.id)}
              title={mode.description}
              style={{
                border: active
                  ? designMode === "neon-trail"
                    ? "1px solid #e879f9"
                    : "1px solid #1a1a1a"
                  : "1px solid rgba(130,130,130,0.55)",
                background: active
                  ? designMode === "neon-trail"
                    ? "rgba(232,121,249,0.18)"
                    : "rgba(26,26,26,0.08)"
                  : "transparent",
                color: designMode === "neon-trail" ? "#f5f3ff" : "#1a1a1a",
                padding: "0.24rem 0.52rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.66rem",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: "pointer",
              }}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      <div
        style={{
          border:
            designMode === "neon-trail"
              ? "1px solid rgba(232,121,249,0.45)"
              : designMode === "archive-desk"
                ? "1px solid #cfb68c"
                : "1px solid #9cb8ea",
          background:
            designMode === "neon-trail"
              ? "rgba(14, 4, 31, 0.55)"
              : designMode === "archive-desk"
                ? "rgba(255,255,255,0.55)"
                : "rgba(255,255,255,0.72)",
          borderRadius: 8,
          padding: "0.7rem 0.72rem",
          display: "grid",
          gap: "0.6rem",
        }}
      >
        <p
          style={{
            margin: 0,
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.77rem",
          }}
        >
          Start article:{" "}
          <a
            href={puzzle.starterArticle}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: designMode === "neon-trail" ? "#f9a8d4" : "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
              fontWeight: 700,
            }}
          >
            Open gateway
          </a>
        </p>

        {puzzle.links.map((link, index) => {
          const isVisited = Boolean(visitedLinks[link.href]);
          return (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => markVisited(link.href)}
              style={{
                display: "block",
                border:
                  designMode === "signal-map"
                    ? `1px solid ${isVisited ? "#4f46e5" : "#8ba9e9"}`
                    : `1px solid ${isVisited ? "#2f855a" : "rgba(40,40,40,0.25)"}`,
                borderRadius: 8,
                padding: "0.55rem 0.62rem",
                background:
                  designMode === "neon-trail"
                    ? isVisited
                      ? "rgba(37, 99, 235, 0.26)"
                      : "rgba(168, 85, 247, 0.16)"
                    : isVisited
                      ? "rgba(209, 250, 229, 0.9)"
                      : "rgba(255,255,255,0.82)",
                color: designMode === "neon-trail" ? "#faf5ff" : "#1a1a1a",
                textDecoration: "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.6rem",
                  marginBottom: "0.18rem",
                }}
              >
                <strong
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.82rem",
                  }}
                >
                  {index + 1}. {link.title}
                </strong>
                <span
                  style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.59rem",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    border: "1px solid currentColor",
                    padding: "0.1rem 0.35rem",
                    borderRadius: 999,
                    opacity: 0.88,
                    whiteSpace: "nowrap",
                  }}
                >
                  Depth {link.depth}
                </span>
              </div>
              <p
                style={{
                  margin: 0,
                  fontFamily: "'IM Fell English', Georgia, serif",
                  fontSize: "0.76rem",
                  opacity: 0.88,
                }}
              >
                {link.blurb}
              </p>
              <p
                style={{
                  margin: "0.3rem 0 0",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.64rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  opacity: 0.92,
                }}
              >
                Bait: {link.lure}
              </p>
            </a>
          );
        })}
      </div>

      <footer style={{ display: "flex", justifyContent: "space-between", gap: "0.7rem", flexWrap: "wrap" }}>
        <span
          style={{
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.76rem",
            fontStyle: "italic",
            opacity: 0.86,
          }}
        >
          Path progress: {visitedCount} / {puzzle.links.length} branches opened
        </span>
        {onNewPuzzle ? (
          <button
            type="button"
            onClick={() => onNewPuzzle(puzzle.difficulty)}
            style={{
              border: "1px solid currentColor",
              background: "transparent",
              color: "inherit",
              padding: "0.22rem 0.6rem",
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "0.66rem",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            New hole
          </button>
        ) : null}
      </footer>
    </section>
  );
}
