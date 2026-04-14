# Security Policy

## Supported Versions

Gentle Stream is pre-1.0. Security fixes are applied to the latest `develop` and `main`
branches. Older snapshots and forks may not receive patches.

## Reporting A Vulnerability

Please do not open public issues for security vulnerabilities.

Report privately with as much detail as possible:

- Contact: `NEXT_PUBLIC_SUPPORT_EMAIL` (or project maintainer security inbox)
- Include: impacted route/component, reproduction steps, expected impact, and any proof-of-concept

We will acknowledge receipt as quickly as possible and aim to provide an initial
assessment within 72 hours.

## Disclosure Process

1. Maintainers confirm triage and severity.
2. A fix is prepared and validated.
3. Release notes mention the fix after patch availability.
4. Public disclosure follows once users have a patched version path.

## Scope

In-scope areas include:

- Authentication/session handling
- API route authorization and data access boundaries
- Secrets and environment handling
- Dependency vulnerabilities in production paths

For system architecture context, see `docs/security-model.md`.
