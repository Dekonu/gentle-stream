/**
 * Build URLs for article hero images.
 *
 * Primary: Pollinations — image from the story's imagePrompt (no API key for basic use).
 * Fallback: Picsum — deterministic stock photo per article so something always loads.
 */

const POLLINATIONS_BASE = "https://image.pollinations.ai/prompt";

/** Strip bracket wrappers and clamp length for URL safety */
export function sanitizeImagePrompt(prompt: string): string {
  return prompt
    .trim()
    .replace(/^\[+/, "")
    .replace(/\]+$/, "")
    .replace(/\s+/g, " ")
    .slice(0, 400);
}

export function pollinationsImageUrl(
  imagePrompt: string,
  width: number,
  height: number
): string | null {
  const q = sanitizeImagePrompt(imagePrompt);
  if (!q) return null;
  const params = new URLSearchParams({
    width: String(width),
    height: String(height),
    nologo: "true",
    enhance: "false",
  });
  return `${POLLINATIONS_BASE}/${encodeURIComponent(q)}?${params.toString()}`;
}

/** Stable hash → Picsum seed so the same article always gets the same fallback photo */
export function picsumFallbackUrl(
  seed: string,
  width: number,
  height: number
): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0;
  }
  const n = Math.abs(hash);
  return `https://picsum.photos/seed/${n}/${width}/${height}`;
}
