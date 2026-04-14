# Release Hygiene Pruning Decisions

Date: 2026-04-14

This note records low-risk pruning decisions made for release hygiene.

## Applied Cleanup

- Removed unused Tailwind pages-router glob from `tailwind.config.ts`.
- Removed `public/desktop.ini` (Windows metadata noise).
- Updated `lib/games/types.ts` to re-export from package import path (`@gentle-stream/domain/games/types`) instead of a fragile relative path into `packages/domain/src`.

## Package Audit: Experimental Workspaces

Audited packages:

- `@gentle-stream/api-client`
- `@gentle-stream/platform-adapters`

Current status:

- Both are intentionally experimental and referenced by architecture/migration docs.
- Neither is currently imported by runtime app routes/components.
- They are retained for planned extraction and mobile split work, not removed in this pass.

Rationale:

- Keeping these packages avoids churn in documented migration plans.
- Removing them now would reduce clarity for upcoming modularization efforts.
- The release docs should continue to mark them as experimental until adopted by production codepaths.
