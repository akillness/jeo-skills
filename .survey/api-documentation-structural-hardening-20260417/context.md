# Context: api-documentation structural hardening

## Workflow Context
`api-documentation` is already the repo’s developer-docs anchor for reference docs, portal pages, SDK/integration guides, auth notes for API consumers, examples, error/rate-limit/webhook guidance, and migration callouts (`.agent-skills/api-documentation/SKILL.md:30-52`). The next maintenance pressure is structural, not coverage: graphify still flags it on the oversized front-door watchlist at 337 lines, and the report recommends moving walkthrough bulk into focused references instead of adding another overlapping skill (`graphify-out/GRAPH_REPORT.md:36-56`).

Primary-source product docs show the lane naturally splits into a few durable doc modes that are now all crammed into one front door:
- Stripe keeps a dense [API Reference](https://docs.stripe.com/api) with global topics like Introduction, Authentication, Errors, Pagination, and Versioning, separate from focused workflow pages.
- Stripe’s [webhook docs](https://docs.stripe.com/webhooks) break webhook work into narrower tasks like Webhook versioning, Resolve webhook signature verification errors, and Process undelivered events.
- GitHub’s [REST API docs](https://docs.github.com/en/rest?apiVersion=2022-11-28) visibly separate Quickstart, OpenAPI description, Rate limits, Pagination, Best practices, and Troubleshooting.
- Redocly’s docs position their platform as multiple surfaces at once: [Redoc API reference and mock server](https://redocly.com/docs/), [Revel external developer showcase](https://redocly.com/docs/), and [Reef internal service catalog](https://redocly.com/docs/).
- Speakeasy’s docs say they provide “guides, tutorials, and reference documentation” for “agents and humans,” plus SDKs, CLI, MCP docs, and API reference in one stack ([Documentation | Speakeasy](https://www.speakeasy.com/docs)).

## Affected Users
| Role | Why structural hardening matters |
|---|---|
| External developers / partners | Need the fastest route to first-success docs, accurate auth/setup, and trustworthy examples instead of a catch-all wall of instructions. Stripe and GitHub both expose quickstarts/guides separately from raw reference. |
| Internal integrators / platform teams | Often need reference truth, rate-limit/error behavior, and migration details without wading through launch/onboarding prose. GitHub and Stripe both elevate these operational topics. |
| Technical writers / DX teams | Need to package one contract source into multiple doc surfaces: reference, quickstart, webhook, SDK, migration, public portal, or internal catalog. Redocly explicitly splits external showcase vs internal catalog products. |
| Agent/tooling consumers | Increasingly consume API docs as structured inputs, not just prose; Speakeasy explicitly frames docs for both humans and agents. |
| Repo maintainers | Need a smaller `SKILL.md` with clearer route-outs so `api-documentation` stays distinct from `api-design`, `technical-writing`, `user-guide-writing`, `authentication-setup`, and `changelog-maintenance` (`.agent-skills/api-documentation/SKILL.md:54-60`). |

## Current Workarounds
1. Keep one broad front door, even though the skill already has support docs for boundaries, example quality, and drift control (`.agent-skills/api-documentation/SKILL.md:41-44`).
2. Lean on docs-generation or docs-sync tooling to mask structure problems instead of clarifying the entry surface. Postman’s [Publish documentation](https://learning.postman.com/docs/publishing-your-api/publishing-your-docs/) flow says published docs automatically include request details and sample code and “automatically stay in sync with your latest changes,” which helps freshness but does not solve mode/boundary sprawl.
3. Push specialized workflows into vendor pages outside the core reference. Stripe’s webhook docs are already separated from the main API reference, suggesting the repo skill can offload more webhook/migration/setup bulk into focused reference packets instead of repeating all of it in `SKILL.md`.
4. Use drift-control reminders as prose inside the main skill even though the repo already has a dedicated anti-drift reference covering contract source, example source, publishing surface, review trigger, and known drift hotspots (`.agent-skills/api-documentation/references/publishing-and-drift-control.md:5-32`).

## Adjacent Problems
- Boundary drift: API-doc requests easily slide into contract design, internal architecture/runbooks, auth implementation, or release-note writing unless route-outs stay aggressive (`.agent-skills/api-documentation/SKILL.md:54-60`).
- Navigation scale: large API surfaces need grouping and predictable left-nav structure, not just more endpoint text. Stoplight users explicitly ask for [x-tagGroups support](https://github.com/stoplightio/elements/issues/1390) because large APIs become hard to navigate when every object gets its own tag.
- Docs-surface fragmentation: Redocly’s external showcase vs internal catalog split highlights that “developer docs” is not one audience surface; structure should acknowledge public portal, internal catalog, SDK docs, and task guides as separate outputs.
- Sync vs editorial quality: generated docs staying in sync is useful, but the repo’s own drift-control doc already warns that reference rendering and editorial review should stay separate so generated output still gets human quality checks (`.agent-skills/api-documentation/references/publishing-and-drift-control.md:24-29`).

## User Voices
- Postman user: “[Allow publishing specific folders or requests within a collection](https://github.com/postmanlabs/postman-app-support/issues/14053)” because publishing the whole collection is a problem for “large collections that contain multiple services or internal-only endpoints.”
- Postman user: “[Published collection documentation page should have json schemas implemented](https://github.com/postmanlabs/postman-app-support/issues/13639)” after schema docs were missing from the “View Full Documentation Page,” showing generated docs can still lose important reference structure.
- Stoplight user: “[Add support for x-tagGroups](https://github.com/stoplightio/elements/issues/1390)” so a technical writer can “group OpenAPI tags under headings for better left-column navigation in API documentation.”
- Stoplight user: “[Incorrect Anchor Links for Section Navigation in Stoplight Elements](https://github.com/stoplightio/elements/issues/2765)” reports broken Request/Response/Body anchor behavior, showing that deep-reference navigation quality matters to users.
- Docusaurus user: “[Autogenerated sidebar items: allow more control on output](https://github.com/facebook/docusaurus/issues/5689)” asks for more control over autogenerated structures, reinforcing that API-doc consumers and maintainers need stronger navigation shaping than pure auto-generation provides.
