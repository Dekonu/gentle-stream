# Dependency Audit Policy

## Scope

Gentle Stream runs two audit lanes:

- `npm run security:audit` (`--omit=dev`) for production dependency risk.
- `npm run security:audit:full` for full tree visibility (including dev toolchain).

## Current Status (2026-04-14)

- `npm audit fix` has been applied.
- `follow-redirects` moderate advisory is resolved.
- Remaining advisories are low severity and tied to Storybook transitive dependencies:
  - `elliptic`
  - `crypto-browserify` chain via `node-polyfill-webpack-plugin`

## Risk Acceptance

- Remaining findings are in development tooling paths and are not loaded in runtime app APIs.
- We retain these temporarily to avoid destabilizing Storybook and contributor workflows before 1.0.0.
- Weekly security workflow runs both production-only and full-tree audits so residual risk stays visible.

## Remediation Plan

1. Re-check Storybook transitive chain on each Storybook minor/patch upgrade.
2. Remove explicit `elliptic` override when upstream tree no longer depends on vulnerable range.
3. Keep documenting accepted dev-only findings until resolved.
