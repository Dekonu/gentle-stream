"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AppLogo } from "@/components/brand/AppLogo";

export function GuestProfileMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (wrapRef.current && target && !wrapRef.current.contains(target)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexShrink: 0,
      }}
    >
      <button
        className="gs-interactive gs-focus-ring"
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Open guest menu"
        onClick={() => setOpen((current) => !current)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.45rem",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "0.15rem 0.25rem",
          textAlign: "left",
        }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "1px solid var(--gs-border)",
            background: "var(--gs-surface-soft)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          <AppLogo heightPx={20} />
        </span>
        <span
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--gs-ink-strong)",
          }}
        >
          Guest
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Guest menu"
          className="gs-card-lift"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "min(280px, 90vw)",
            background: "var(--gs-surface-elevated)",
            border: "1px solid var(--gs-border-strong)",
            borderRadius: "var(--gs-radius-lg)",
            boxShadow: "var(--gs-shadow-popover)",
            padding: "0.9rem",
            zIndex: 220,
          }}
        >
          <p
            style={{
              margin: "0 0 0.65rem",
              fontFamily: "'IM Fell English', Georgia, serif",
              fontSize: "0.76rem",
              color: "var(--gs-muted)",
            }}
          >
            You are browsing as a guest.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
            <Link href="/about" onClick={() => setOpen(false)} style={{ color: "var(--gs-accent)" }}>
              About
            </Link>
            <Link href="/privacy" onClick={() => setOpen(false)} style={{ color: "var(--gs-accent)" }}>
              Privacy
            </Link>
            <Link href="/terms" onClick={() => setOpen(false)} style={{ color: "var(--gs-accent)" }}>
              Terms
            </Link>
            <Link href="/data-deletion" onClick={() => setOpen(false)} style={{ color: "var(--gs-accent)" }}>
              Data deletion
            </Link>
          </div>
          <div style={{ display: "flex", gap: "0.45rem", marginTop: "0.8rem" }}>
            <Link
              href="/login?next=%2F"
              onClick={() => setOpen(false)}
              style={{
                display: "inline-block",
                padding: "0.42rem 0.72rem",
                borderRadius: "999px",
                border: "1px solid var(--gs-border-strong)",
                background: "var(--gs-surface-elevated)",
                color: "var(--gs-ink-strong)",
                textDecoration: "none",
                fontSize: "0.72rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Sign in
            </Link>
            <Link
              href="/login?next=%2F"
              onClick={() => setOpen(false)}
              style={{
                display: "inline-block",
                padding: "0.42rem 0.72rem",
                borderRadius: "999px",
                border: "1px solid var(--gs-ink-strong)",
                background: "var(--gs-ink-strong)",
                color: "var(--gs-surface)",
                textDecoration: "none",
                fontSize: "0.72rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Sign up
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
