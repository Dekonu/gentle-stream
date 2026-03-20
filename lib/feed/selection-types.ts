/**
 * Feed selection — types & extension points
 *
 * Today: `getRankedFeed` in `lib/agents/rankerAgent.ts` loads candidates using
 * profile category weights, then optional random backfills (see `FeedSelectionMode`).
 *
 * Later (engagement-driven): plug in additional strategies without rewriting the API:
 *   - Add signals to `FeedSelectionContext` (e.g. dwell time, saves, skips).
 *   - Implement new candidate sources (e.g. "similar to saved", "trending").
 *   - Compose strategies in ranker: primary → fallback chain, gated by flags / experiments.
 *
 * Keep HTTP contract stable (`FeedResponse`); add optional fields as you evolve.
 */

import type { Category } from "../constants";
import type { UserProfile } from "../types";

/** How this section’s articles were chosen — canonical type is `FeedSelectionMode` in `lib/types.ts`. */

/** Context passed into selection (expand when you add preference / engagement data). */
export interface FeedSelectionContext {
  userId: string;
  profile: UserProfile;
  sectionIndex: number;
  pageSize: number;
  /** Bar filter — null means mixed feed */
  categoryFilter: Category | null;
  /**
   * Feature flags, A/B buckets, etc. (optional)
   * Example: `{ useEngagementRanker: true }`
   */
  flags?: Record<string, boolean | string | number>;
}
