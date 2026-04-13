# User guide writing modes and boundaries

Use this reference to keep `user-guide-writing` narrow and reliable inside the documentation cluster.

## Canonical scope
`user-guide-writing` owns **customer-facing or admin-facing guidance that helps someone complete a workflow in the product**.

Typical outputs:
- getting-started guides
- tutorials
- task-based how-to articles
- FAQs
- help-center updates after shipped UI/workflow changes

## Route-outs

### Route to `technical-writing`
Use `technical-writing` when the real job is for builders/operators:
- design docs
- architecture docs
- ADRs
- runbooks
- migration plans
- internal developer guides

Question to ask: **Is the reader mainly building, operating, or changing the system rather than using the product?**

### Route to `api-documentation`
Use `api-documentation` when the output is for developers integrating with an API/SDK:
- OpenAPI / Swagger reference
- endpoint docs
- authentication examples
- SDK method docs
- developer portal content

Question to ask: **Is the reader calling the product through code rather than clicking through the UI?**

### Route to `changelog-maintenance`
Use `changelog-maintenance` when the work is primarily release communication:
- CHANGELOG.md upkeep
- semantic version summaries
- release-note formatting
- "what changed" publishing

Question to ask: **Is the task mainly summarizing shipped change history rather than teaching a task?**

## Diátaxis-style mode split
- **Getting started**: shortest path to first success
- **Tutorial**: learn by doing with context and milestones
- **How-to**: solve a specific task fast
- **FAQ**: answer repeated questions and route deeper
- **Release-help update**: patch existing user docs after a shipped UI or workflow change

If one draft tries to do all of these, split it.

## High-signal boundary examples
- "Write docs for setting up SSO in the admin console" → `user-guide-writing`
- "Write the SSO architecture and rollout plan" → `technical-writing`
- "Document the SSO REST endpoints and webhook schema" → `api-documentation`
- "Summarize SSO changes in v2.4.0 release notes" → `changelog-maintenance`

## Common failure modes
- turning a help article into a product-tour brochure
- burying prerequisites after the first step
- mixing support FAQ, migration warnings, and tutorial context into one giant page
- copying internal implementation details that the end user cannot act on
- forgetting to note plan/role/version differences that change the UI path
