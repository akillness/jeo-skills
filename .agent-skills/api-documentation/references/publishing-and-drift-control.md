# Publishing and Drift Control

API docs decay when rendering and writing are treated as one-time generation tasks.

## Decide the maintenance chain
Record four things explicitly:
1. contract source of truth (OpenAPI/schema/code annotations)
2. example source of truth (tests, fixtures, verified requests, SDK snippets)
3. publishing surface (portal, docs site, repo Markdown, SDK site)
4. review trigger (release, endpoint change, auth change, migration, incident)

## Drift hotspots
Check these first on every refresh:
- auth requirements or scopes
- sandbox vs production details
- base URL / version path changes
- error payloads
- pagination/cursor behavior
- rate limits and retries
- webhook event fields and signatures
- SDK install/config examples
- deprecated endpoints/fields and migration notes

## Lightweight anti-drift tactics
- link docs work to release reviews when API behavior changes
- derive examples from tests or verified requests when possible
- keep migration updates near the affected docs, not only in release notes
- use docs-gap notes when the contract is ambiguous instead of faking certainty
- separate reference rendering from editorial review so portal output still gets human quality checks

## Route-out reminder
When the docs task exposes an unresolved contract question, route the open question to `api-design` and keep the documentation work honest.
