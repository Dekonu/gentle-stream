"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface GuestAuthPromptModalProps {
  open: boolean;
  loginHref: string;
  onClose: () => void;
}

export function GuestAuthPromptModal({
  open,
  loginHref,
  onClose,
}: GuestAuthPromptModalProps) {
  const primaryRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    primaryRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-auth-prompt-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        background: "var(--gs-backdrop-scrim)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "min(22rem, 92vw)",
          borderRadius: "var(--gs-radius-lg)",
          border: "1px solid var(--gs-border-strong)",
          background: "var(--gs-surface-elevated)",
          boxShadow: "var(--gs-shadow-overlay)",
          padding: "1.35rem 1.25rem 1.25rem",
        }}
      >
        <h2
          id="guest-auth-prompt-title"
          style={{
            margin: 0,
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "1.05rem",
            lineHeight: 1.4,
            fontWeight: 600,
            color: "var(--gs-ink-strong)",
            textAlign: "center",
          }}
        >
          Must be logged in to like or save a post.
        </h2>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.55rem",
            marginTop: "1.1rem",
          }}
        >
          <Link
            ref={primaryRef}
            href={loginHref}
            className="gs-guest-auth-cta-primary gs-interactive gs-focus-ring"
            onClick={() => onClose()}
          >
            Log in / Sign up
          </Link>
          <button
            type="button"
            className="gs-guest-auth-cta-secondary gs-focus-ring"
            onClick={onClose}
          >
            Not now
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
