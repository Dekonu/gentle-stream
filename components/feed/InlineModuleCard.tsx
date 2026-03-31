"use client";

import type {
  FeedModuleData,
  GeneratedImageModuleData,
  TodoModuleData,
} from "@/lib/types";

interface InlineModuleCardProps {
  moduleType: "generated_art" | "todo";
  data: FeedModuleData;
}

export default function InlineModuleCard({
  moduleType,
  data,
}: InlineModuleCardProps) {
  if (moduleType === "todo" && data.mode === "todo") {
    const td = data as TodoModuleData;
    return (
      <aside
        style={{
          borderTop: "1px solid var(--gs-border)",
          padding: "0.5rem 0.6rem",
          background: "var(--gs-surface-soft)",
          borderRadius: "0 0 var(--gs-radius-sm) var(--gs-radius-sm)",
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.78rem",
            fontWeight: 700,
            marginBottom: "0.28rem",
          }}
        >
          {td.title}
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: "1rem",
            fontFamily: "'IBM Plex Sans', system-ui, sans-serif",
            fontSize: "0.7rem",
            color: "#4c463d",
            lineHeight: 1.45,
          }}
        >
          {td.items.slice(0, 3).map((item) => (
            <li
              key={item.id}
              style={{
                textDecoration: item.done ? "line-through" : undefined,
                opacity: item.done ? 0.65 : 1,
              }}
            >
              {item.label}
            </li>
          ))}
        </ul>
      </aside>
    );
  }

  if (moduleType === "generated_art" && data.mode === "generated_art") {
    const art = data as GeneratedImageModuleData;
    return (
      <aside
        style={{
          borderTop: "1px solid var(--gs-border)",
          padding: "0.5rem 0.6rem",
          background: "var(--gs-surface-soft)",
          borderRadius: "0 0 var(--gs-radius-sm) var(--gs-radius-sm)",
        }}
      >
        <div
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.78rem",
            fontWeight: 700,
            marginBottom: "0.28rem",
          }}
        >
          {art.title}
        </div>
        <img
          src={art.imageUrl}
          alt=""
          loading="lazy"
          style={{
            width: "100%",
            maxHeight: 130,
            objectFit: "cover",
            border: "1px solid var(--gs-border)",
            borderRadius: "var(--gs-radius-xs)",
          }}
        />
      </aside>
    );
  }

  return null;
}
