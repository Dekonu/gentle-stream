/**
 * Canonical dedup keys shared by ingest prechecks and tests.
 */
export function buildHeadlineFingerprint(headline: string, category: string): string {
  const normalizedHeadline = headline
    .toLowerCase()
    .replace(/['''"",.:;!?()[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return `${normalizedHeadline}|${category.toLowerCase()}`;
}

export function normaliseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname.replace(/\/$/, "");
    return `${host}${path}`.toLowerCase();
  } catch {
    return url
      .replace(/^https?:\/\/(www\.)?/, "")
      .replace(/[?#].*$/, "")
      .replace(/\/$/, "")
      .toLowerCase();
  }
}
