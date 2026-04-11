# Security Model (High-level)

## Data boundary

- User-facing reads/writes are expected to go through RLS-protected tables in Supabase/Postgres.
- Service role credentials are server-only and must never be exposed to the browser.

## RLS posture

- RLS is enabled across user-owned and engagement-sensitive tables.
- Policies should enforce:
  - per-user ownership for profile and preference records,
  - scoped write access for user actions (likes, saves, stats),
  - restricted access to moderation/admin surfaces.

See migration history, including `lib/db/migrations/056_enable_rls_remaining_tables.sql`, for rollout steps.

## Operational controls

- Cron routes are protected by `CRON_SECRET`.
- Optional webhook verification uses shared secret/signature checks where available.
- Security scripts (`npm run security:*`) are intended to be run routinely in CI and before release candidates.

## Deployment notes

- Keep `SUPABASE_SERVICE_ROLE_KEY` in server environment only.
- For public/fork CI, use non-secret placeholders when running build/type checks.
- Do not enable optional external modules without required keys and clear failure behavior.

