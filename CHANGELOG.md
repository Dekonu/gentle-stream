# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog and this project uses Semantic Versioning.

## [Unreleased]

### Added
- RSS feed preview modal flow in feed cards: RSS narrative cards now show excerpt + `Read more` instead of always rendering full body inline.
- RSS relevance filtering heuristics to drop common UI chrome fragments from fetched source text (e.g. caption toggles, short non-narrative labels).
- `lib/feed/envFlags.ts` helper to centralize boolean/integer env parsing in feed UI.
- `CONTRIBUTING.md`, `docs/env-matrix.md`, and `docs/security-model.md` for release hygiene and contributor onboarding.
- OSS contributor support files: `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue templates, and pull request template.
- Release hygiene notes: `docs/release-hygiene-baseline.md` and `docs/release-hygiene-pruning.md`.
- Dependency audit policy documentation in `docs/dependency-audit-policy.md`.
- Contributor API route index in `API.md`.

### Changed
- Feed helper usage now prefers `@gentle-stream/feed-engine` exports (`cleanArticleForFeed`, `articleUniqKey`, `shouldBeGame`) over duplicate local implementations.
- Optional feed modules are strict opt-in by default in UI config (`NEXT_PUBLIC_FEED_GAP_FILL_ENABLED`, `NEXT_PUBLIC_FEED_INLINE_MODULES_ENABLED`, `NEXT_PUBLIC_TODO_MODULE_ENABLED` default off when unset).
- Dark-mode readability improved for article card text surfaces, category drawer controls, and feed utility controls by moving to theme-aware tokens.
- `.env.example` now defaults optional feed modules (Spotify/todo/gap-fill/inline) to disabled.
- Admin API routes now share a centralized `requireAdmin` guard (`lib/api/adminAuth.ts`) to remove repeated auth logic.
- `NewsFeed`, `LoginForm`, and `ingestAgent` now delegate utility helpers to smaller modules for readability (`components/feed/news-feed-helpers.ts`, `components/auth/login-form-utils.ts`, `lib/agents/ingest/parsing.ts`).
- CI now runs `npm run lint`, and lint warning budget is reduced from `9999` to `50`.
- README deployment, cron, framework version, and Turnstile setup guidance now match repository configuration.
- Weekly security workflow now runs both production-only (`security:audit`) and full-tree (`security:audit:full`) npm audit lanes.

### Known Issues
- Spotify tiles and game tiles still have partial dark-mode parity gaps; full visual pass is planned as release hygiene before `0.1.0`.

