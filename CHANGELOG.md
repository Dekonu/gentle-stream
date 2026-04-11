# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project uses Semantic Versioning.

## [Unreleased]

### Added
- RSS feed preview modal flow in feed cards: RSS narrative cards now show excerpt + `Read more` instead of always rendering full body inline.
- RSS relevance filtering heuristics to drop common UI chrome fragments from fetched source text (e.g. caption toggles, short non-narrative labels).
- `lib/feed/envFlags.ts` helper to centralize boolean/integer env parsing in feed UI.
- `CONTRIBUTING.md`, `docs/env-matrix.md`, and `docs/security-model.md` for release hygiene and contributor onboarding.

### Changed
- Feed helper usage now prefers `@gentle-stream/feed-engine` exports (`cleanArticleForFeed`, `articleUniqKey`, `shouldBeGame`) over duplicate local implementations.
- Optional feed modules are strict opt-in by default in UI config (`NEXT_PUBLIC_FEED_GAP_FILL_ENABLED`, `NEXT_PUBLIC_FEED_INLINE_MODULES_ENABLED`, `NEXT_PUBLIC_TODO_MODULE_ENABLED` default off when unset).
- Dark-mode readability improved for article card text surfaces, category drawer controls, and feed utility controls by moving to theme-aware tokens.
- `.env.example` now defaults optional feed modules (Spotify/todo/gap-fill/inline) to disabled.

### Known Issues
- Spotify tiles and game tiles still have partial dark-mode parity gaps; full visual pass is planned as release hygiene before `0.1.0`.

