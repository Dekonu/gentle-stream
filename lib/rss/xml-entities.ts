export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec: string) => {
      const codePoint = Number.parseInt(dec, 10);
      if (!Number.isFinite(codePoint)) return _;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return _;
      }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      if (!Number.isFinite(codePoint)) return _;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return _;
      }
    })
    .replace(/&amp;/gi, "&");
}

export function hasXmlEntities(value: string): boolean {
  return /&(amp|lt|gt|quot|apos);|&#\d+;|&#x[0-9a-f]+;/i.test(value);
}

