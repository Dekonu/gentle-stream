export interface ExcerptClampInput {
  baselineLines: number;
  maxLines: number;
  availableHeightPx: number;
  lineHeightPx: number;
}

export function computeAdaptiveExcerptClamp(input: ExcerptClampInput): number {
  const baseline = Math.max(1, Math.floor(input.baselineLines));
  const max = Math.max(baseline, Math.floor(input.maxLines));
  if (!Number.isFinite(input.availableHeightPx) || !Number.isFinite(input.lineHeightPx)) {
    return baseline;
  }
  if (input.availableHeightPx <= 0 || input.lineHeightPx <= 0) return baseline;
  const possible = Math.floor(input.availableHeightPx / input.lineHeightPx);
  if (!Number.isFinite(possible) || possible <= baseline) return baseline;
  return Math.min(max, possible);
}
