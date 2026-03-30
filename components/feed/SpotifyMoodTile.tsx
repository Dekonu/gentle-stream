"use client";

import type { SpotifyMoodTileData } from "@/lib/types";

interface SpotifyMoodTileProps {
  data: SpotifyMoodTileData;
  reason: "gap" | "interval";
}

export default function SpotifyMoodTile({ data, reason }: SpotifyMoodTileProps) {
  const reasonLabel = reason === "gap" ? "gap-fill" : "interval";

  return (
    <section
      style={{
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#f7f3ea",
        padding: "0.95rem 1rem",
      }}
      aria-label="Spotify mood module"
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: "0.75rem",
          borderBottom: "1px solid #d7d0c1",
          paddingBottom: "0.4rem",
          marginBottom: "0.75rem",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontWeight: 700,
            letterSpacing: "0.01em",
            fontSize: "1.03rem",
            color: "#1f1f1f",
          }}
        >
          {data.title}
        </h3>
        <span
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.67rem",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "#746a55",
          }}
        >
          {reasonLabel}
        </span>
      </header>

      <p
        style={{
          margin: "0 0 0.55rem",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#4f463b",
          fontSize: "0.9rem",
        }}
      >
        {data.subtitle}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.7rem",
          marginBottom: "0.55rem",
        }}
      >
        <span
          style={{
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.72rem",
            color: "#665d4f",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}
        >
          Mood: {data.mood}
        </span>
        {data.playlistUrl ? (
          <a
            href={data.playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
              fontSize: "0.72rem",
              color: "#1a472a",
              textDecoration: "underline",
              textUnderlineOffset: "2px",
            }}
          >
            Open in Spotify
          </a>
        ) : null}
      </div>

      {data.tracks.length > 0 ? (
        <ol
          style={{
            margin: 0,
            paddingLeft: "1.1rem",
            display: "grid",
            gap: "0.35rem",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.78rem",
            color: "#3f3a30",
          }}
        >
          {data.tracks.slice(0, 5).map((track) => (
            <li key={track.id}>
              <a
                href={track.spotifyUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "#1a472a", textDecoration: "none" }}
              >
                {track.name} — {track.artist}
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p
          style={{
            margin: 0,
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            color: "#7a6f5d",
            fontSize: "0.82rem",
          }}
        >
          No tracks available for this mood yet.
        </p>
      )}
    </section>
  );
}
