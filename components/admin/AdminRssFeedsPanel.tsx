"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { RssFeedRecord } from "@/lib/types";

interface NewFeedFormState {
  feedUrl: string;
  publisher: string;
  label: string;
  categoryHint: string;
  localeHint: string;
  toneRiskScore: number;
}

const DEFAULT_FORM: NewFeedFormState = {
  feedUrl: "",
  publisher: "",
  label: "",
  categoryHint: "",
  localeHint: "global",
  toneRiskScore: 2,
};

export function AdminRssFeedsPanel() {
  const [feeds, setFeeds] = useState<RssFeedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState<NewFeedFormState>(DEFAULT_FORM);
  const [creating, setCreating] = useState(false);

  async function loadFeeds(): Promise<void> {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/rss-feeds", {
        credentials: "include",
      });
      const payload = (await response.json().catch(() => ({}))) as {
        feeds?: RssFeedRecord[];
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not load RSS feed registry.");
        return;
      }
      setFeeds(payload.feeds ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFeeds();
  }, []);

  async function createFeed(): Promise<void> {
    if (!form.feedUrl.trim()) {
      setMessage("Feed URL is required.");
      return;
    }
    setMessage(null);
    setCreating(true);
    try {
      const response = await fetch("/api/admin/rss-feeds", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          feedUrl: form.feedUrl.trim(),
          publisher: form.publisher.trim() || undefined,
          label: form.label.trim() || undefined,
          categoryHint: form.categoryHint.trim() || undefined,
          localeHint: form.localeHint.trim() || undefined,
          toneRiskScore: form.toneRiskScore,
          isEnabled: true,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!response.ok) {
        setMessage(payload.error ?? "Could not create RSS feed.");
        return;
      }
      setForm(DEFAULT_FORM);
      await loadFeeds();
    } finally {
      setCreating(false);
    }
  }

  async function patchFeed(
    id: string,
    payload: Partial<{
      isEnabled: boolean;
      toneRiskScore: number;
    }>
  ): Promise<void> {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/rss-feeds/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not update feed.");
        return;
      }
      await loadFeeds();
    } finally {
      setBusyId(null);
    }
  }

  async function removeFeed(id: string): Promise<void> {
    setBusyId(id);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/rss-feeds/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setMessage(body.error ?? "Could not delete feed.");
        return;
      }
      await loadFeeds();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#ede9e1", padding: "1rem" }}>
      <div style={{ maxWidth: "1080px", margin: "0 auto", display: "grid", gap: "0.9rem" }}>
        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
            <h1 style={{ margin: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.45rem" }}>
              Admin RSS feed registry
            </h1>
            <div style={{ display: "flex", gap: "0.55rem" }}>
              <Link
                href="/admin/submissions"
                style={{
                  padding: "0.35rem 0.62rem",
                  border: "1px solid #888",
                  background: "#fff",
                  color: "#1a1a1a",
                  textDecoration: "none",
                  fontSize: "0.8rem",
                }}
              >
                Moderation queue
              </Link>
              <Link
                href="/"
                style={{
                  padding: "0.35rem 0.62rem",
                  border: "1px solid #888",
                  background: "#fff",
                  color: "#1a1a1a",
                  textDecoration: "none",
                  fontSize: "0.8rem",
                }}
              >
                Back to app
              </Link>
            </div>
          </div>
          <p style={{ margin: "0.4rem 0 0", color: "#666", fontFamily: "'IM Fell English', Georgia, serif" }}>
            Manage ingest sources for RSS-seeded discovery. Disable noisy feeds and monitor fetch health.
          </p>
        </div>

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          <h2 style={{ marginTop: 0, fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.05rem" }}>
            Add feed
          </h2>
          <div style={{ display: "grid", gap: "0.45rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            <input
              value={form.feedUrl}
              onChange={(event) => setForm((prev) => ({ ...prev, feedUrl: event.target.value }))}
              placeholder="https://example.com/feed.xml"
              style={{ padding: "0.42rem", border: "1px solid #bbb", gridColumn: "span 3" }}
            />
            <input
              value={form.publisher}
              onChange={(event) => setForm((prev) => ({ ...prev, publisher: event.target.value }))}
              placeholder="Publisher"
              style={{ padding: "0.42rem", border: "1px solid #bbb" }}
            />
            <input
              value={form.label}
              onChange={(event) => setForm((prev) => ({ ...prev, label: event.target.value }))}
              placeholder="Label"
              style={{ padding: "0.42rem", border: "1px solid #bbb" }}
            />
            <input
              value={form.categoryHint}
              onChange={(event) => setForm((prev) => ({ ...prev, categoryHint: event.target.value }))}
              placeholder="Category hint"
              style={{ padding: "0.42rem", border: "1px solid #bbb" }}
            />
            <input
              value={form.localeHint}
              onChange={(event) => setForm((prev) => ({ ...prev, localeHint: event.target.value }))}
              placeholder="Locale hint (global, US, ...)"
              style={{ padding: "0.42rem", border: "1px solid #bbb" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.82rem" }}>
              Tone risk
              <input
                type="number"
                min={0}
                max={10}
                value={form.toneRiskScore}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    toneRiskScore: Math.max(0, Math.min(10, Number(event.target.value) || 0)),
                  }))
                }
                style={{ width: "5rem", padding: "0.35rem", border: "1px solid #bbb" }}
              />
            </label>
            <button
              type="button"
              disabled={creating}
              onClick={() => void createFeed()}
              style={{ padding: "0.42rem 0.62rem", border: "1px solid #1a472a", background: "#fff", cursor: "pointer" }}
            >
              {creating ? "Adding..." : "Add feed"}
            </button>
          </div>
        </div>

        {message ? <p style={{ margin: 0, color: "#7b2d00" }}>{message}</p> : null}

        <div style={{ background: "#faf8f3", border: "1px solid #d8d2c7", padding: "1rem" }}>
          {loading ? (
            <p style={{ margin: 0, color: "#666" }}>Loading RSS feeds...</p>
          ) : feeds.length === 0 ? (
            <p style={{ margin: 0, color: "#666" }}>No feeds configured yet.</p>
          ) : (
            <div style={{ display: "grid", gap: "0.6rem" }}>
              {feeds.map((feed) => (
                <div key={feed.id} style={{ border: "1px solid #ddd", background: "#fff", padding: "0.7rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                    <strong style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
                      {feed.publisher || "Publisher"} — {feed.label || "Feed"}
                    </strong>
                    <span style={{ fontSize: "0.72rem", color: feed.isEnabled ? "#1a472a" : "#8b4513" }}>
                      {feed.isEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <p style={{ margin: "0.35rem 0 0", fontSize: "0.8rem", color: "#555", wordBreak: "break-all" }}>
                    {feed.feedUrl}
                  </p>
                  <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "#777" }}>
                    {feed.localeHint || "global"} · {feed.categoryHint || "uncategorized"} · tone risk{" "}
                    {feed.toneRiskScore} · failures {feed.consecutiveFailures}
                  </p>
                  {feed.lastError ? (
                    <p style={{ margin: "0.25rem 0 0", fontSize: "0.73rem", color: "#8b4513" }}>
                      Last error: {feed.lastError}
                    </p>
                  ) : null}
                  <div style={{ marginTop: "0.45rem", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      disabled={busyId === feed.id}
                      onClick={() => void patchFeed(feed.id, { isEnabled: !feed.isEnabled })}
                      style={{ padding: "0.33rem 0.58rem", border: "1px solid #888", background: "#fff", cursor: "pointer" }}
                    >
                      {feed.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === feed.id}
                      onClick={() => void removeFeed(feed.id)}
                      style={{ padding: "0.33rem 0.58rem", border: "1px solid #8b4513", background: "#fff", cursor: "pointer" }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

