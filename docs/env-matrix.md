# Environment Matrix

This matrix clarifies required and optional variables by environment.

## Local development

- Required:
  - `NEXT_PUBLIC_SUPABASE_URL` (URL-shaped placeholder acceptable)
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (placeholder acceptable with auth disabled)
  - `SUPABASE_SERVICE_ROLE_KEY` (placeholder acceptable with auth disabled)
- Recommended:
  - `AUTH_DISABLED=1`
  - `DEV_USER_ID=dev-local`
  - `DEV_LIGHT=1`
- Optional module flags (default off when unset):
  - `NEXT_PUBLIC_FEED_GAP_FILL_ENABLED`
  - `NEXT_PUBLIC_FEED_INLINE_MODULES_ENABLED`
  - `NEXT_PUBLIC_TODO_MODULE_ENABLED`
  - `SPOTIFY_MODULE_ENABLED`
  - `NEXT_PUBLIC_SPOTIFY_MODULE_ENABLED`

## CI

- Required:
  - URL-shaped `NEXT_PUBLIC_SUPABASE_URL`
  - Placeholder `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Placeholder `SUPABASE_SERVICE_ROLE_KEY`
- Optional:
  - Real Supabase credentials for integration tests
  - `CRON_SECRET` for cron route tests, if used

## Production

- Required:
  - Real Supabase keys
  - `CRON_SECRET`
- Required if turnstile enabled:
  - `NEXT_PUBLIC_TURNSTILE_ENABLED=1`
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
  - `TURNSTILE_ENABLED=1`
  - `TURNSTILE_SECRET_KEY`
- Telemetry defaults:
  - `NEXT_PUBLIC_ENGAGEMENT_SCROLL_DEPTH_ENABLED`: defaults on when unset
  - `FEED_SEEN_TABLE_READS_ENABLED`: defaults on when unset
- Optional modules are explicit opt-in:
  - Weather/NASA/Spotify/todo/gap-fill/inline behavior should be enabled only when flags and required keys are present.

