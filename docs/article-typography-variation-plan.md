# Deterministic Article Typography Plan

Goal: vary in-article heading/subheading appearance so long pieces feel editorially rich, while staying deterministic and safe across clients.

## Constraints

- Deterministic from article content/id (no random runtime drift).
- Accessible contrast in light and dark themes.
- Graceful fallback if metadata is missing.
- No server-side LLM required for styling decisions.

## Proposed model

1. Derive a stable seed:
   - Prefer `article.id`.
   - Fallback to hash of `headline + byline + category`.
2. Map seed to a finite style palette:
   - `h1`: size tier `xl|lg`
   - `h2`: size tier `lg|md`
   - accent tone token `accentA|accentB|accentC` (mapped to theme variables)
3. Apply classes on markdown render:
   - Extend `ArticleBodyMarkdown` renderer for `h1/h2/h3` to include deterministic class names.
4. Fallback:
   - If seed cannot be derived, use default `article-markdown` heading styles.

## Example class strategy

- `article-heading--tier-xl`
- `article-heading--tier-lg`
- `article-heading--accent-a`
- `article-heading--accent-b`

All classes resolve to CSS variables (`--gs-text`, `--gs-muted`, `--gs-accent`) for theme safety.

## Rollout steps

1. Add a tiny deterministic hash utility (`lib/articles/typographySeed.ts`).
2. Add heading style selector (`lib/articles/headingStyle.ts`) returning class tuple.
3. Update `ArticleBodyMarkdown` heading components to attach classes.
4. Add visual checks in Storybook (light/dark).
5. Add unit tests for deterministic mapping.

