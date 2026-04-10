import { describe, expect, it } from "vitest";
import { decodeXmlEntities, hasXmlEntities } from "@/lib/rss/xml-entities";

describe("xml entity decoding", () => {
  it("decodes common named entities including apos", () => {
    expect(
      decodeXmlEntities("Tom &amp; Jerry &lt;3 &quot;quote&quot; &apos;single&apos;")
    ).toBe(`Tom & Jerry <3 "quote" 'single'`);
  });

  it("decodes decimal and hex numeric entities", () => {
    expect(decodeXmlEntities("Rock &#39;n&#39; roll &#x27;ok&#x27;")).toBe(
      "Rock 'n' roll 'ok'"
    );
  });

  it("detects entity presence", () => {
    expect(hasXmlEntities("A &apos; title")).toBe(true);
    expect(hasXmlEntities("No entities here")).toBe(false);
  });
});

