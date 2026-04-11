"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { ArticleBodyMarkdown } from "@/components/articles/ArticleBodyMarkdown";

interface ArticleReaderModalProps {
  open: boolean;
  headline: string;
  byline: string;
  body: string;
  onClose: () => void;
  readingTimeSecs?: number | null;
}

export function ArticleReaderModal({
  open,
  headline,
  byline,
  body,
  onClose,
  readingTimeSecs,
}: ArticleReaderModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    closeButtonRef.current?.focus();

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
      aria-label={`Full article: ${headline}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(9, 7, 4, 0.46)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "min(900px, 96vw)",
          maxHeight: "88vh",
          borderRadius: "var(--gs-radius-lg)",
          border: "1px solid var(--gs-border-strong)",
          background: "var(--gs-surface-elevated)",
          boxShadow: "var(--gs-shadow-overlay)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <header
          style={{
            padding: "0.95rem 1rem 0.85rem",
            borderBottom: "1px solid var(--gs-border)",
            background: "var(--gs-surface-soft)",
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "1.2rem",
                lineHeight: 1.2,
                color: "var(--gs-ink-strong)",
              }}
            >
              {headline}
            </h3>
            <p
              style={{
                margin: "0.35rem 0 0",
                fontFamily: "Georgia, serif",
                fontSize: "0.74rem",
                letterSpacing: "0.04em",
                color: "var(--gs-muted)",
              }}
            >
              By {byline}
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="gs-interactive gs-focus-ring"
            onClick={onClose}
            style={{
              border: "1px solid var(--gs-border-strong)",
              borderRadius: "var(--gs-radius-pill)",
              background: "var(--gs-surface-soft)",
              color: "var(--gs-ink-strong)",
              width: "1.9rem",
              height: "1.9rem",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              flexShrink: 0,
              fontFamily: "'Playfair Display', Georgia, serif",
              fontSize: "1.05rem",
              lineHeight: 1,
            }}
            aria-label="Close article reader"
            title="Close"
          >
            ×
          </button>
        </header>
        <div
          style={{
            overflowY: "auto",
            padding: "1rem 1.15rem 1.2rem",
          }}
        >
          <ArticleBodyMarkdown
            markdown={body}
            variant="reader"
            fontPreset="classic"
            multiColumn={false}
            readingTimeSecs={readingTimeSecs}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
