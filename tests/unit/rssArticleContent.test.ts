import { afterEach, describe, expect, it, vi } from "vitest";
import {
  fetchArticlePlainTextFromUrl,
  resolveHttpUrlForFetch,
} from "@/lib/rss/articleContent";

const realFetch = global.fetch;

function makeHtmlResponse(html: string): Response {
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

describe("resolveHttpUrlForFetch", () => {
  it("prefixes https for host/path stored like normaliseUrl()", () => {
    expect(resolveHttpUrlForFetch("npr.org/2026/04/10/article")).toBe(
      "https://npr.org/2026/04/10/article"
    );
  });

  it("passes through absolute http(s) URLs", () => {
    expect(resolveHttpUrlForFetch("https://example.com/a")).toBe("https://example.com/a");
    expect(resolveHttpUrlForFetch("http://example.com/a")).toBe("http://example.com/a");
  });

  it("returns null for mailto and other non-http schemes", () => {
    expect(resolveHttpUrlForFetch("mailto:news@example.com")).toBeNull();
  });
});

describe("fetchArticlePlainTextFromUrl", () => {
  afterEach(() => {
    global.fetch = realFetch;
    vi.restoreAllMocks();
  });

  it("extracts article text from html", async () => {
    global.fetch = vi.fn(async () =>
      makeHtmlResponse(`<!doctype html>
        <html>
          <body>
            <header>
              <a href="/home">Home</a>
              <a href="/topics">Topics</a>
            </header>
            <main>
              <article>
                <h1>Antarctic penguin numbers rise</h1>
                <p>The conservation team observed a clear rebound this season.</p>
                <p>Researchers credited stronger habitat protection and cleaner waters.</p>
              </article>
            </main>
            <footer>Read more</footer>
          </body>
        </html>`)
    ) as typeof fetch;

    const extracted = await fetchArticlePlainTextFromUrl("https://example.com/story");

    expect(extracted).toContain("The conservation team observed a clear rebound this season.");
    expect(extracted).toContain(
      "Researchers credited stronger habitat protection and cleaner waters."
    );
  });

  it("filters likely UI chrome fragments from extracted text", async () => {
    global.fetch = vi.fn(async () =>
      makeHtmlResponse(`<!doctype html>
        <html>
          <body>
            <article>
              <p>hide caption</p>
              <p>toggle caption</p>
              <p>Hanna Barczyk for NPR</p>
              <p>1 min read</p>
              <p>The project restored mangrove wetlands that protect the coast.</p>
              <p>Scientists say the pilot can be replicated across similar estuaries.</p>
            </article>
          </body>
        </html>`)
    ) as typeof fetch;

    const extracted = await fetchArticlePlainTextFromUrl("https://example.com/story");

    expect(extracted).toContain(
      "Scientists say the pilot can be replicated across similar estuaries."
    );
    expect(extracted).not.toContain("hide caption");
    expect(extracted).not.toContain("toggle caption");
    expect(extracted).not.toContain("for NPR");
  });

  it("returns null when fetching fails", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network down");
    }) as typeof fetch;

    const extracted = await fetchArticlePlainTextFromUrl("https://example.com/story");
    expect(extracted).toBeNull();
  });

  it("returns null for non-http links", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const extracted = await fetchArticlePlainTextFromUrl("mailto:news@example.com");
    expect(extracted).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
