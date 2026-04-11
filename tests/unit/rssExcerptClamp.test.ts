import { describe, expect, it } from "vitest";
import { computeAdaptiveExcerptClamp } from "@/lib/articles/rssExcerptClamp";

describe("computeAdaptiveExcerptClamp", () => {
  it("returns baseline when available height is too small", () => {
    expect(
      computeAdaptiveExcerptClamp({
        baselineLines: 6,
        maxLines: 18,
        availableHeightPx: 80,
        lineHeightPx: 20,
      })
    ).toBe(6);
  });

  it("expands clamp when space allows", () => {
    expect(
      computeAdaptiveExcerptClamp({
        baselineLines: 6,
        maxLines: 18,
        availableHeightPx: 220,
        lineHeightPx: 20,
      })
    ).toBe(11);
  });

  it("caps at max lines", () => {
    expect(
      computeAdaptiveExcerptClamp({
        baselineLines: 7,
        maxLines: 12,
        availableHeightPx: 500,
        lineHeightPx: 20,
      })
    ).toBe(12);
  });
});
