"use client";

import type { ArticleEngagementEventInput } from "@/lib/engagement/types";

const FLUSH_INTERVAL_MS = 4000;
const MAX_BATCH_SIZE = 50;

let queue: ArticleEngagementEventInput[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let sessionId: string | null = null;
let engagementDisabled = false;
const lastEventAtByKey = new Map<string, number>();
let sequence = 0;
let fallbackSessionCounter = 0;

interface SessionCrypto {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

function toHex(byte: number): string {
  return byte.toString(16).padStart(2, "0");
}

function buildUuidFromBytes(bytes: Uint8Array): string {
  if (bytes.length < 16) throw new Error("Expected 16 bytes for UUID.");
  // RFC 4122 version 4 bits.
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, toHex).join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function getSessionId(): string {
  if (sessionId) return sessionId;
  const webCrypto = (globalThis as { crypto?: SessionCrypto }).crypto;
  if (webCrypto) {
    if (typeof webCrypto.randomUUID === "function") {
      sessionId = webCrypto.randomUUID();
      return sessionId;
    }
    if (typeof webCrypto.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      webCrypto.getRandomValues(bytes);
      sessionId = buildUuidFromBytes(bytes);
      return sessionId;
    }
  }
  fallbackSessionCounter += 1;
  sessionId = `session-${Date.now().toString(36)}-${fallbackSessionCounter.toString(36)}`;
  return sessionId;
}

async function flushNow(): Promise<void> {
  if (engagementDisabled) {
    queue = [];
    return;
  }
  if (queue.length === 0) return;
  const batch = queue.slice(0, MAX_BATCH_SIZE);
  queue = queue.slice(MAX_BATCH_SIZE);

  try {
    const response = await fetch("/api/user/article-engagement", {
      method: "POST",
      credentials: "include",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: batch }),
    });
    if (response.status === 401) {
      engagementDisabled = true;
      queue = [];
      return;
    }
  } catch {
    // Ignore failures; this is best-effort telemetry.
  }

  if (queue.length > 0) {
    void flushNow();
  }
}

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushNow();
  }, FLUSH_INTERVAL_MS);
}

export function trackArticleEngagement(
  event: Omit<ArticleEngagementEventInput, "sessionId" | "occurredAt">
): void {
  if (engagementDisabled) return;
  const nowMs = Date.now();
  const dedupeKey = `${event.articleId}|${event.eventType}|${event.eventValue ?? "null"}`;
  const lastAt = lastEventAtByKey.get(dedupeKey) ?? 0;
  if (nowMs - lastAt < 1500) return;
  lastEventAtByKey.set(dedupeKey, nowMs);
  sequence += 1;
  queue.push({
    ...event,
    sessionId: getSessionId(),
    occurredAt: new Date(nowMs).toISOString(),
    context: {
      ...(event.context ?? {}),
      seq: sequence,
    },
  });
  if (queue.length >= MAX_BATCH_SIZE) {
    void flushNow();
    return;
  }
  scheduleFlush();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (queue.length === 0) return;
    const payload = JSON.stringify({ events: queue.slice(0, MAX_BATCH_SIZE) });
    navigator.sendBeacon(
      "/api/user/article-engagement",
      new Blob([payload], { type: "application/json" })
    );
  });
}

