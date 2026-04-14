import { describe, expect, it } from "vitest";
import type { Article, FeedSection } from "@/lib/types";
import { deriveSingletonPlacementFromHydratedSections } from "@/components/NewsFeed";

function minimalArticle(id: string): Article {
  return {
    id,
    headline: "H",
    subheadline: "",
    body: "x",
    category: "Science & Discovery",
    contentKind: "news",
  } as Article;
}

const minimalWeatherData = {
  mode: "weather" as const,
  title: "Weather Brief",
  subtitle: "",
  locationLabel: "X",
  temperatureC: 10,
  condition: "clear",
  humidity: 50,
  windKph: 5,
};

describe("deriveSingletonPlacementFromHydratedSections", () => {
  it("detects weather in single-hero reading rail", () => {
    const sections: FeedSection[] = [
      {
        sectionType: "articles",
        index: 0,
        articles: [minimalArticle("a")],
        newspaperLayout: {
          templateId: "single-hero",
          layouts: ["hero"],
          residualGapPx: 0,
          readingRail: {
            enabled: true,
            primary: { kind: "weather", data: minimalWeatherData },
          },
        },
      },
    ];
    const p = deriveSingletonPlacementFromHydratedSections(sections);
    expect(p.weatherBriefLoaded).toBe(true);
    expect(p.singletonPlaced.weather).toBe(true);
  });

  it("detects standalone weather module row", () => {
    const sections: FeedSection[] = [
      {
        sectionType: "module",
        index: 1,
        moduleType: "weather",
        fillerType: "weather",
        reason: "singleton",
        data: minimalWeatherData,
      },
    ];
    const p = deriveSingletonPlacementFromHydratedSections(sections);
    expect(p.weatherBriefLoaded).toBe(true);
    expect(p.singletonPlaced.weather).toBe(true);
  });

  it("returns false when no weather surfaces", () => {
    const sections: FeedSection[] = [
      {
        sectionType: "articles",
        index: 0,
        articles: [minimalArticle("a"), minimalArticle("b")],
        newspaperLayout: {
          templateId: "two-columns",
          layouts: ["standard", "standard"],
          residualGapPx: 0,
        },
      },
    ];
    const p = deriveSingletonPlacementFromHydratedSections(sections);
    expect(p.weatherBriefLoaded).toBe(false);
    expect(p.singletonPlaced.weather).toBe(false);
  });
});
