/**
 * Shared Claude call for crossword clue JSON (keys: "N-across", "N-down", …).
 */

import {
  buildCluePromptBlock,
  canonicalizeClueKeys,
} from "./crosswordClueMerge";
import type { CrosswordSlot } from "./crosswordGridFiller";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function fetchCrosswordCluesFromAnthropic(
  apiKey: string,
  slots: CrosswordSlot[],
  category: string
): Promise<Record<string, string>> {
  const wordList = buildCluePromptBlock(slots);

  const prompt =
    `You are writing clues for a newspaper crossword puzzle with a "${category}" theme.\n\n` +
    `For each ENTRY below, write ONE short crossword clue (5–10 words).\n` +
    `Rules:\n` +
    `- Clues must be fair — a solver who knows the answer should recognise it immediately\n` +
    `- Vary the style: some definitions, some wordplay, some fill-in-the-blank\n` +
    `- Do NOT include the answer word in the clue\n` +
    `- Theme the clue to "${category}" where natural, but don't force it\n` +
    `- Each key is NUMBER-direction (e.g. 1-across and 1-down are different entries even if the word is the same)\n\n` +
    `Entries:\n${wordList}\n\n` +
    `Return ONLY JSON with keys like "1-across","1-down","2-down", etc. No preamble, no markdown:\n` +
    `{"1-across":"clue one","1-down":"clue two",...}`;

  const model =
    process.env.ANTHROPIC_CROSSWORD_MODEL?.trim() ||
    "claude-sonnet-4-20250514";

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    const parsed = JSON.parse(text.slice(start, end + 1)) as Record<
      string,
      unknown
    >;
    const strMap: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string") strMap[k] = v;
    }
    return canonicalizeClueKeys(strMap);
  } catch {
    console.error(
      "[crosswordAnthropicClues] Failed to parse clues JSON:",
      text.slice(0, 300)
    );
    return {};
  }
}
