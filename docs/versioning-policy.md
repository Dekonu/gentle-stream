# Versioning Policy

Gentle Stream uses Semantic Versioning (`MAJOR.MINOR.PATCH`) with pre-1.0 rules.

Current baseline: `0.1.0`.

## Bump Rules

### Pre-1.0 (`0.x.y`)

- Breaking change: bump `MINOR` (`0.1.0` -> `0.2.0`)
- Backward-compatible feature: bump `MINOR` (`0.1.0` -> `0.2.0`)
- Bug fix (including "silent" user-visible fixes): bump `PATCH` (`0.1.0` -> `0.1.1`)
- Docs/chore/internal-only (no runtime behavior change): no mandatory release; may batch into next planned release

### Post-1.0 (`1.x.y+`)

- Breaking change: bump `MAJOR` (`1.4.2` -> `2.0.0`)
- Backward-compatible feature: bump `MINOR` (`1.4.2` -> `1.5.0`)
- Bug fix: bump `PATCH` (`1.4.2` -> `1.4.3`)

## Mapping To Decimal-Style Intent

If you think in decimal increments:

- `+1` corresponds to semver major (`x.0.0` after 1.0)
- `+0.1` corresponds to semver minor (`0.1.0` -> `0.2.0`, or `1.4.0` -> `1.5.0`)
- `+0.01` corresponds to semver patch (`0.1.0` -> `0.1.1`, or `1.4.2` -> `1.4.3`)

Use semver fields directly; do not treat versions as decimal math.

## Release Cadence Guidance

- `0.1.x`: stabilization and release-hygiene fixes
- `0.2.0`: first major internal cleanup/modularity milestone
- `1.0.0`: stable public contracts and contributor/release process

## Release Steps

1. Move `CHANGELOG.md` entries from `Unreleased` into a new version heading.
2. Run quality gates: lint, typecheck, unit/component tests, and selected smoke/e2e.
3. Tag release (`v0.1.0`, `v0.1.1`, ...).
4. Publish release notes from changelog entries.
