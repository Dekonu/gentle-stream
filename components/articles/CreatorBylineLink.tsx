import Link from "next/link";
import type { CSSProperties } from "react";

interface CreatorBylineLinkProps {
  byline: string;
  authorUserId?: string | null;
  /** When false, render plain text (ingest / legacy). */
  linkToProfile?: boolean;
  accentColor?: string;
}

export function CreatorBylineLink({
  byline,
  authorUserId,
  linkToProfile = false,
  accentColor = "#1a472a",
}: CreatorBylineLinkProps) {
  const display = byline.trim() || "Creator";
  const base: CSSProperties = {
    fontWeight: 600,
    color: "#555",
  };

  if (!linkToProfile || !authorUserId) {
    return <span style={base}>{display}</span>;
  }

  return (
    <Link
      href={`/creator/${authorUserId}`}
      style={{
        ...base,
        color: accentColor,
        textDecoration: "underline",
        textUnderlineOffset: "2px",
      }}
    >
      {display}
    </Link>
  );
}
