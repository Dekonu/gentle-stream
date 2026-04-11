import { describe, expect, it } from "vitest";
import { normalizeRssNarrativeText } from "@/lib/rss/rssNarrativeMerge";

describe("normalizeRssNarrativeText", () => {
  it("removes inline modifier tags and keeps narrative text", () => {
    const input = [
      "<em>Breakthrough</em> in filtering technology.",
      "<strong>Researchers</strong> report a durable membrane.",
    ].join("\n");

    const normalized = normalizeRssNarrativeText(input);
    expect(normalized).toContain("Breakthrough in filtering technology.");
    expect(normalized).toContain("Researchers report a durable membrane.");
    expect(normalized).not.toContain("<em>");
    expect(normalized).not.toContain("<strong>");
  });

  it("drops common chrome lines", () => {
    const input = [
      "hide caption",
      "toggle caption",
      "toggle captions",
      "1 min read",
      "Scientists scaled a new process to industrial pilots.",
    ].join("\n");

    const normalized = normalizeRssNarrativeText(input);
    expect(normalized).toContain(
      "Scientists scaled a new process to industrial pilots."
    );
    expect(normalized).not.toContain("hide caption");
    expect(normalized).not.toContain("toggle caption");
    expect(normalized).not.toContain("toggle captions");
    expect(normalized).not.toContain("1 min read");
  });

  it("strips toggle captions embedded in a sentence", () => {
    const normalized = normalizeRssNarrativeText(
      "The team published results. toggle captions More data arrived next quarter."
    );
    expect(normalized.toLowerCase()).not.toContain("toggle caption");
    expect(normalized).toMatch(/published results/i);
  });

  it("removes short credit-only lines", () => {
    const input = [
      "Hanna Barczyk for NPR",
      "The classroom project expanded to neighboring districts and raised reading scores.",
    ].join("\n");

    const normalized = normalizeRssNarrativeText(input);
    expect(normalized).toContain(
      "The classroom project expanded to neighboring districts and raised reading scores."
    );
    expect(normalized).not.toContain("for NPR");
  });

  it("reflows run-on text into readable paragraphs", () => {
    const input =
      "The fellowship empowered teachers to share difficult stories with students. " +
      "Participants said vulnerability in writing improved classroom trust. " +
      "Many educators continued journaling weekly to support reflective practice. " +
      "School leaders noticed stronger engagement in literacy workshops. " +
      "Mentors said the cohort model created lasting peer support.";

    const normalized = normalizeRssNarrativeText(input);
    expect(normalized).toContain("\n\n");
  });
});
