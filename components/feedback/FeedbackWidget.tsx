"use client";

import { useCallback, useState } from "react";

export function FeedbackWidget() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const submit = useCallback(async () => {
    const trimmed = message.trim();
    if (trimmed.length < 1) return;
    setStatus("sending");
    try {
      const pageUrl =
        typeof window !== "undefined" ? window.location.href.slice(0, 2000) : undefined;
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          message: trimmed,
          pageUrl: pageUrl ?? undefined,
          contactEmail: contactEmail.trim() || null,
        }),
      });
      if (!res.ok) {
        setStatus("error");
        return;
      }
      setStatus("sent");
      setMessage("");
      setContactEmail("");
    } catch {
      setStatus("error");
    }
  }, [message, contactEmail]);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        zIndex: 180,
      }}
      aria-live="polite"
    >
      {open ? (
        <div
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: "min(320px, 92vw)",
            borderRadius: "var(--gs-radius-lg)",
            border: "1px solid var(--gs-border-strong)",
            background: "var(--gs-surface-elevated)",
            padding: "0.75rem",
            boxShadow: "var(--gs-shadow-popover)",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <p
            style={{
              margin: "0 0 0.5rem",
              fontSize: "0.7rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--gs-muted)",
              fontFamily: "'Playfair Display', Georgia, serif",
            }}
          >
            Send feedback
          </p>
          <label
            htmlFor="gs-feedback-msg"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              border: 0,
            }}
          >
            Message
          </label>
          <textarea
            id="gs-feedback-msg"
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (status === "sent" || status === "error") setStatus("idle");
            }}
            rows={4}
            maxLength={4000}
            placeholder="What would help?"
            style={{
              width: "100%",
              boxSizing: "border-box",
              resize: "vertical",
              marginBottom: "0.5rem",
              borderRadius: "var(--gs-radius-sm)",
              border: "1px solid var(--gs-border)",
              background: "var(--gs-surface)",
              color: "var(--gs-ink-strong)",
              padding: "0.4rem 0.5rem",
              fontSize: "0.85rem",
            }}
          />
          <label
            htmlFor="gs-feedback-email"
            style={{
              position: "absolute",
              width: 1,
              height: 1,
              padding: 0,
              margin: -1,
              overflow: "hidden",
              clip: "rect(0,0,0,0)",
              border: 0,
            }}
          >
            Email (optional)
          </label>
          <input
            id="gs-feedback-email"
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            placeholder="Email (optional, for follow-up)"
            autoComplete="email"
            style={{
              width: "100%",
              boxSizing: "border-box",
              marginBottom: "0.5rem",
              borderRadius: "var(--gs-radius-sm)",
              border: "1px solid var(--gs-border)",
              background: "var(--gs-surface)",
              color: "var(--gs-ink-strong)",
              padding: "0.35rem 0.5rem",
              fontSize: "0.8rem",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" }}>
            <button
              type="button"
              onClick={submit}
              disabled={status === "sending" || message.trim().length < 1}
              style={{
                borderRadius: "var(--gs-radius-pill)",
                border: "none",
                background: "var(--gs-accent)",
                padding: "0.36rem 0.68rem",
                fontSize: "0.8rem",
                fontWeight: 600,
                color: "var(--gs-surface)",
                opacity: status === "sending" || message.trim().length < 1 ? 0.55 : 1,
                cursor:
                  status === "sending" || message.trim().length < 1 ? "not-allowed" : "pointer",
              }}
            >
              {status === "sending" ? "Sending…" : "Send"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setStatus("idle");
              }}
              style={{
                fontSize: "0.75rem",
                color: "var(--gs-muted)",
                textDecoration: "underline",
                textUnderlineOffset: "0.14em",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>
          {status === "sent" ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--gs-success)" }}>
              Thanks — we received it.
            </p>
          ) : null}
          {status === "error" ? (
            <p style={{ margin: "0.5rem 0 0", fontSize: "0.75rem", color: "var(--gs-warning)" }}>
              Could not send. Try again later.
            </p>
          ) : null}
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          if (status === "sent") setStatus("idle");
        }}
        title={open ? "Close feedback" : "Send feedback"}
        style={{
          width: "2rem",
          height: "2rem",
          borderRadius: "999px",
          border: "1px solid var(--gs-border-strong)",
          background: "var(--gs-surface-soft)",
          color: "var(--gs-ink-strong)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
        }}
        aria-expanded={open}
        aria-label={open ? "Close feedback" : "Open feedback"}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden
        >
          <path
            d="M4 5.5H20V16.5H9.2L5.7 19V16.5H4V5.5Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}
