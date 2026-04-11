import { describe, expect, it } from "vitest";
import { looksLikelyNonEnglishText } from "@/lib/articles/languageHeuristics";

describe("looksLikelyNonEnglishText", () => {
  it("flags Spanish narrative text as non-English", () => {
    const sample =
      "Los astronautas de Artemis II tienen previsto completar su sobrevuelo lunar y regresar a la Tierra a las 5:07 p. m. " +
      "Esto es lo que debes saber antes de la transmisión oficial.";
    expect(looksLikelyNonEnglishText(sample)).toBe(true);
  });

  it("does not flag straightforward English narrative text", () => {
    const sample =
      "The restoration team completed coastal reinforcement this week and local residents reported reduced flooding during storms.";
    expect(looksLikelyNonEnglishText(sample)).toBe(false);
  });
});
