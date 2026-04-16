import { describe, expect, it } from "vitest";
import {
  buildHeadlineFingerprint,
  normaliseUrl,
} from "@/lib/articles/dedup-keys";

describe("buildHeadlineFingerprint", () => {
  it("normalises case, spacing, and selected punctuation", () => {
    const a = buildHeadlineFingerprint(
      "  Bull Sharks'  Social Lives?!  ",
      "Science & Discovery"
    );
    const b = buildHeadlineFingerprint(
      "bull sharks social lives",
      "science & discovery"
    );
    expect(a).toBe(b);
  });

  it("keeps categories distinct for the same headline", () => {
    const education = buildHeadlineFingerprint("Same Headline", "Education");
    const science = buildHeadlineFingerprint("Same Headline", "Science & Discovery");
    expect(education).not.toBe(science);
  });
});

describe("normaliseUrl", () => {
  it("strips scheme, www, query, and fragment", () => {
    expect(
      normaliseUrl("https://www.bbc.com/news/article-123?utm_source=rss#comments")
    ).toBe("bbc.com/news/article-123");
  });

  it("lowercases host and path and removes trailing slash", () => {
    expect(normaliseUrl("HTTP://BBC.COM/News/Article-123/")).toBe(
      "bbc.com/news/article-123"
    );
  });

  it("drops port from canonical key (current behavior)", () => {
    expect(normaliseUrl("https://example.com:8080/a/b")).toBe("example.com/a/b");
  });

  it("handles invalid urls with fallback normalization", () => {
    expect(normaliseUrl("www.Example.com/Path/?utm_medium=x")).toBe(
      "www.example.com/path"
    );
  });

  it("normalises percent-encoded paths consistently with URL parser", () => {
    expect(normaliseUrl("https://example.com/A%20B")).toBe("example.com/a%20b");
  });
});
