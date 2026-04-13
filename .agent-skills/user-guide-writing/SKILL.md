---
name: user-guide-writing
description: >
  Write user-facing documentation for onboarding, tutorials, how-to guides, FAQs,
  help-center articles, release-facing help updates, and task-based support content.
  Use when the main job is helping end users or admins complete product tasks,
  recover from confusion, or learn a workflow through clear prerequisites,
  screenshots/placeholders, and step-by-step guidance. Triggers on: user guide,
  tutorial, onboarding guide, getting started, help article, how-to, FAQ,
  support doc, knowledge-base article, product walkthrough, and customer-facing
  documentation. Route internal specs/runbooks/ADRs to `technical-writing`, API
  portals/SDK reference docs to `api-documentation`, and release-note /
  semver hygiene to `changelog-maintenance`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for Markdown, help-center, docs-site, or knowledge-base workflows where the
  output teaches users how to complete tasks in a real product rather than how the
  underlying system is implemented.
license: MIT
metadata:
  tags: user-guides, tutorials, documentation, onboarding, how-to, faq, help-center, customer-docs, product-education
  platforms: Claude, ChatGPT, Gemini
  version: "2.0.0"
  modernization: 2026-04-13
---

# User Guide Writing

Use this skill when the main job is **writing or restructuring customer-facing documentation that helps people learn, complete, or recover a product workflow**.

`user-guide-writing` is the documentation-cluster anchor for:
- getting-started and onboarding guides
- tutorials and guided walkthroughs
- task-based how-to articles
- FAQs and support content
- release-facing help-center updates for changed workflows
- user/admin docs that need prerequisites, warnings, screenshots, and maintenance notes

Read these support docs before choosing the mode or boundary:
- [references/document-modes-and-boundaries.md](references/document-modes-and-boundaries.md)
- [references/workflow-checklist.md](references/workflow-checklist.md)
- [references/maintenance-signals.md](references/maintenance-signals.md)

## When to use this skill
- A product needs a getting-started guide that helps a new user reach the first successful outcome
- A feature launch needs a user-facing tutorial or how-to article rather than internal implementation notes
- A help center or docs site needs a task-based article, troubleshooting FAQ, or onboarding path
- Support pain keeps recurring and the answer should become reusable public documentation
- A workflow changed and the existing user-facing steps, screenshots, warnings, or prerequisites need to be updated
- A product or ops team needs customer/admin guidance that explains what to click, what to expect, and what can go wrong

## When not to use this skill
- **The main job is an internal spec, architecture doc, ADR, runbook, migration plan, or developer-facing implementation guide** → use `technical-writing`
- **The main job is published API reference, SDK docs, OpenAPI examples, or developer-portal content** → use `api-documentation`
- **The main job is release-note hygiene, semantic version summaries, or `CHANGELOG.md` upkeep** → use `changelog-maintenance`
- **The main job is product positioning, marketing copy, launch messaging, or lifecycle email copy** → use `marketing-automation` or the relevant marketing skill
- **The main job is in-app onboarding mechanics or product-tour implementation** → use the relevant product/UX skill first, then use this skill for the durable written companion docs

## Instructions

### Step 1: Classify the user-doc mode
Normalize the request into one primary mode before drafting.

```yaml
user_guide_mode:
  primary_mode: getting-started | tutorial | how-to | faq | release-help-update
  audience: end-user | admin | manager | mixed | unknown
  experience_level: first-time | familiar | advanced | mixed | unknown
  docs_surface: help-center | docs-site | in-app-companion | pdf | unknown
  source_of_truth: product-ui | release-notes | support-tickets | sme-notes | mixed | unknown
  maintenance_need: one-off | recurring | stale-doc-rewrite | launch-critical
```

Choose one primary mode per run:
- `getting-started` → first-success path for a new user
- `tutorial` → guided learning flow with context and milestones
- `how-to` → task-based instructions for a specific outcome
- `faq` → concise recurring questions, edge cases, and redirects to deeper docs
- `release-help-update` → user-facing update for changed behavior, renamed UI, or new workflow steps

### Step 2: Confirm the audience, task, and route-outs
Before writing, answer four questions:
1. Who will follow this doc, and what role/permissions do they have?
2. What exact task or outcome should they achieve?
3. Which prerequisites, plan limits, or environment assumptions could break the flow?
4. Which neighboring documentation skills must stay out of scope?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| "Write the developer portal / API docs / SDK reference" | `api-documentation` |
| "Write a design doc / architecture doc / runbook" | `technical-writing` |
| "Summarize what shipped this release" | `changelog-maintenance` |
| "Write onboarding docs / tutorial / FAQ / help article" | `user-guide-writing` |

### Step 3: Gather the minimum user-facing evidence
Do not write customer-facing steps from vibes alone. Pull the smallest credible evidence set first:
- current UI labels, navigation, and states
- prerequisites, permissions, and plan / edition assumptions
- expected result after each important step
- likely failure points, empty states, and confusing branches
- screenshots or screenshot placeholders for key transitions
- existing support tickets, search terms, or recurring user questions if available
- release changes that made existing docs stale

If the product details are incomplete, label assumptions explicitly and avoid pretending the guide is verified.

### Step 4: Match the structure to the mode
Use the smallest structure that fits the chosen job.

#### A. Getting-started guide
Use for first-success onboarding.

Recommended skeleton:
```markdown
# Get Started with <Product / Feature>

## Who this is for
## What you will accomplish
## Prerequisites
## Step 1: <first action>
## Step 2: <next action>
## Step 3: <first success state>
## Common mistakes
## Next steps
## Where to get help
```

#### B. Tutorial
Use for guided learning that explains why each step matters.

Recommended skeleton:
```markdown
# Tutorial: <Outcome>

## What you will build / learn
## Time and prerequisites
## Before you start
## Step 1
## Step 2
## Step 3
## Check your result
## What changed and why it matters
## Next tutorial / related guides
```

#### C. How-to guide
Use for an existing user trying to complete one task quickly.

Recommended skeleton:
```markdown
# How to <Task>

## Before you begin
## Step 1
## Step 2
## Step 3
## Verify success
## Troubleshooting
## Related tasks
```

#### D. FAQ
Use when repeated questions need short, scannable answers.

Recommended skeleton:
```markdown
# Frequently Asked Questions

## <Category>
### <Question>
Short answer
Longer answer if needed
Link to the deeper guide if one exists
```

#### E. Release-facing help update
Use when existing docs must catch up with a shipped change.

Recommended skeleton:
```markdown
# <Feature / Workflow> update

## What changed
## Who is affected
## New steps
## Differences from the old flow
## Screenshot / UI callout updates needed
## Related help articles to update
```

### Step 5: Apply user-doc rules instead of generic writing advice
Use these rules aggressively:
- **Lead with task and audience**, not with implementation internals.
- **Name prerequisites early**: account type, permissions, browser/app version, data required, or setup already completed.
- **Prefer observable actions**: what the user clicks, types, sees, and receives.
- **Keep one major outcome per guide**. Split when a page tries to teach setup, daily use, troubleshooting, and release notes all at once.
- **Use screenshots or screenshot placeholders sparingly and intentionally** at confusing transitions, not after every click.
- **Call out branching conditions** like role-based UI differences, plan limits, or alternate paths.
- **Give the user a success check** so they know the task worked.
- **Troubleshooting belongs near the task**, not hidden in a separate generic appendix.
- **Link outward deliberately**: tutorials → deeper how-to guides, FAQs → full guides, release updates → affected help articles.

### Step 6: Use the Diátaxis boundary on purpose
Treat doc types as separate jobs instead of one blob:
- `tutorial` = learn by doing, with context and milestones
- `how-to` = solve one practical task fast
- `faq` = answer repeat questions and redirect
- `getting-started` = shortest path to first success

If the draft starts mixing all four, split it into a small guide set rather than forcing everything into one page.

### Step 7: Make the guide maintainable
Before finalizing, add the maintenance details future editors will need:
- product version / release window if relevant
- permissions or plan assumptions
- screenshot inventory or placeholders still needed
- linked companion docs that should stay in sync
- phrases or UI labels likely to go stale after release
- owner / review checkpoint if the doc is launch-critical

Use this quick checklist:
1. Can a new user follow the steps without private context?
2. Are warnings and prerequisites visible before the user gets stuck?
3. Does every screenshot or placeholder justify itself?
4. Is there a clear success state?
5. Are route-outs to API docs, internal docs, or changelog work explicit where needed?

### Step 8: Review for scannability and support deflection
Good user docs help humans and support teams. Before shipping:
- shorten headings until they are easy to scan in a help-center sidebar
- promote the most common blockers into callouts or FAQ entries
- remove product-team jargon unless the UI uses it verbatim
- keep paragraphs short; prefer bullets for options and limits
- ensure related guides and escalation paths are easy to find

### Step 9: Output the smallest useful artifact set
Return only the artifacts the request actually needs. Common outputs:
- one onboarding / getting-started page
- one how-to article plus a mini FAQ
- a tutorial plus companion troubleshooting notes
- a release-help update plus a list of stale docs to patch
- a doc-refresh plan that names which user-facing pages need rewritten screenshots or steps

## Output format
Use this when the user does not specify another format:

```markdown
# <Guide title>

## Audience
## Goal
## Prerequisites
## Steps / sections matched to the chosen mode
## Troubleshooting or FAQ
## Success check
## Related guides / next steps
```

For maintenance-heavy requests, add:

```markdown
## Doc maintenance notes
- Source of truth:
- Screenshots to capture/update:
- Related docs to keep in sync:
- Assumptions to verify:
```

## Examples

### Example 1: SaaS onboarding guide
**Request:** "Write a getting-started guide for new workspace admins connecting their first data source."

Use `getting-started` mode:
- audience = admin
- outcome = first successful connection
- prerequisites = workspace owner rights, data-source credentials, supported browser
- output = short onboarding guide + common setup blockers + next steps

### Example 2: Help-center article after UI changes
**Request:** "Update our help article for exporting reports because the menu moved and there is now a CSV/XLSX choice."

Use `release-help-update` mode:
- compare old vs new steps
- explicitly mark screenshot/UI callout updates
- keep changelog language out of the article unless it helps explain the new flow
- add a success check and troubleshooting for missing export permissions

### Example 3: FAQ from repeated support questions
**Request:** "Turn these recurring support replies into a concise FAQ for billing admins."

Use `faq` mode:
- cluster by recurring user task or confusion
- keep each answer short
- link to the full how-to guide when the answer needs step-by-step detail
- pull role/plan caveats into the first sentence instead of burying them

## Best practices
1. Default to one user outcome per guide.
2. Prefer realistic user tasks over feature-tour prose.
3. Use exact UI text when it helps accuracy; avoid internal team jargon.
4. Make hidden assumptions visible early.
5. Keep screenshots intentional and easy to refresh.
6. Split tutorials, how-to guides, FAQs, and release updates when the document starts doing too many jobs.
7. Route internal technical detail to `technical-writing`, API surface detail to `api-documentation`, and release-note hygiene to `changelog-maintenance`.
8. Use support signals and stale-doc clues to prioritize updates, not just launch announcements.

## References
- [Diátaxis](https://diataxis.fr/)
- [Google developer documentation style guide](https://developers.google.com/style)
- [Microsoft Writing Style Guide](https://learn.microsoft.com/style-guide/welcome/)
- [GitLab documentation workflow](https://docs.gitlab.com/development/documentation/)
