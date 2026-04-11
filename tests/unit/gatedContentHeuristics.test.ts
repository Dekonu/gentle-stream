import { describe, expect, it } from "vitest";
import { assessGatedContent } from "@/lib/articles/gatedContentHeuristics";

describe("assessGatedContent", () => {
  it("flags login/teaser style bodies", () => {
    const out = assessGatedContent({
      headline: "Breaking policy update",
      subheadline: "Officials shared a major change",
      body:
        "Sign in to continue reading this article.\n\nRead more: https://example.com/a https://example.com/b https://example.com/c\n\nRelated stories",
    });

    expect(out.isLikelyGated).toBe(true);
    expect(out.reasons).toContain("sign_in");
  });

  it("does not flag narrative article copy", () => {
    const out = assessGatedContent({
      headline: "Wetland restoration expands fish habitat",
      subheadline: "Communities report improved flood resilience",
      body:
        "Volunteers restored 12 kilometers of coastal wetlands this season, and the first ecological survey shows stronger nursery habitat for fish and shellfish.\n\nLocal officials said the project also reduced floodwater pressure in nearby neighborhoods and cut emergency cleanup costs after spring storms.",
    });

    expect(out.isLikelyGated).toBe(false);
  });
});
