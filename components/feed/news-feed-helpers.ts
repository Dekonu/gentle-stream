import type {
  EditorialBreatherModuleData,
  FeedSection,
  SpotifyMoodTileData,
} from "@/lib/types";

export function appendUniqueFeedSections(
  existing: FeedSection[],
  incoming: FeedSection[]
): FeedSection[] {
  if (incoming.length === 0) return existing;
  const seenIndexes = new Set(existing.map((section) => section.index));
  const uniqueIncoming = incoming.filter((section) => {
    if (seenIndexes.has(section.index)) return false;
    seenIndexes.add(section.index);
    return true;
  });
  if (uniqueIncoming.length === 0) return existing;
  return [...existing, ...uniqueIncoming];
}

export function spotifyContentSignature(data: SpotifyMoodTileData | null): string | null {
  if (!data) return null;
  const topTracks = data.tracks
    .slice(0, 8)
    .map((track) => `${track.id}|${track.name}|${track.artist}`)
    .join("||");
  return [
    data.mode,
    data.mood,
    data.title,
    data.subtitle,
    data.playlistUrl ?? "",
    topTracks,
  ].join("::");
}

export function deriveSingletonPlacementFromHydratedSections(sections: FeedSection[]): {
  weatherBriefLoaded: boolean;
  singletonPlaced: { weather: boolean; spotify: boolean; nasa: boolean };
  nasaSurfaceUsed: boolean;
  spotifySignatures: string[];
} {
  let weatherBriefLoaded = false;
  let spotifyPlaced = false;
  let nasaPlaced = false;
  const spotifySignatures: string[] = [];

  for (const section of sections) {
    if (section.sectionType === "module" || section.sectionType === "filler") {
      if (section.moduleType === "weather") weatherBriefLoaded = true;
      if (section.moduleType === "spotify") spotifyPlaced = true;
      if (section.moduleType === "nasa") nasaPlaced = true;
      if (section.moduleType === "spotify") {
        const sig = spotifyContentSignature(section.data as SpotifyMoodTileData);
        if (sig) spotifySignatures.push(sig);
      }
    }
    if (section.sectionType !== "articles") continue;
    const rail = section.newspaperLayout?.readingRail;
    if (!rail?.enabled) continue;
    for (const mod of [rail.primary, rail.secondary]) {
      if (!mod) continue;
      if (mod.kind === "weather") weatherBriefLoaded = true;
      if (mod.kind === "spotify") {
        spotifyPlaced = true;
        const sig = spotifyContentSignature(mod.data);
        if (sig) spotifySignatures.push(sig);
      }
      if (mod.kind === "nasa") nasaPlaced = true;
    }
  }

  return {
    weatherBriefLoaded,
    singletonPlaced: {
      weather: weatherBriefLoaded,
      spotify: spotifyPlaced,
      nasa: nasaPlaced,
    },
    nasaSurfaceUsed: nasaPlaced,
    spotifySignatures,
  };
}

export function buildEditorialBreatherData(input: {
  sectionIndex: number;
  category?: string;
  motif?: EditorialBreatherModuleData["motif"];
  href?: string;
  hrefLabel?: string;
}): EditorialBreatherModuleData {
  const motifPool: EditorialBreatherModuleData["motif"][] = [
    "linework",
    "divider",
    "stamp",
  ];
  const motif = input.motif ?? motifPool[Math.abs(input.sectionIndex % motifPool.length)]!;
  const categoryLabel = input.category?.trim() || "Today";
  const lines = [
    "A short pause in the page rhythm, before the next column.",
    "A quiet interlude to keep the print flow breathable.",
    "An editorial breath between longer reads.",
    "A subtle spacer that preserves the broadsheet cadence.",
  ];
  return {
    mode: "editorial_breather",
    title: `${categoryLabel} desk note`,
    kicker: "Editorial pause",
    line: lines[Math.abs(input.sectionIndex % lines.length)]!,
    motif,
    href: input.href,
    hrefLabel: input.hrefLabel,
  };
}
