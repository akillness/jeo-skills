---
name: user-guide-writing
description: >
  Write user-facing documentation for onboarding, tutorials, task how-to guides,
  FAQs, help-center updates, and release-facing help refreshes. Use when the main
  job is helping end users or admins complete a product workflow, recover from a
  blocker, or understand a changed UI path. Triggers on: user guide, tutorial,
  getting started, onboarding doc, help article, how-to, FAQ, knowledge-base
  article, support doc, release help update, and customer-facing documentation.
  Route internal specs/runbooks to `technical-writing`, API portals/SDK docs to
  `api-documentation`, and release-note hygiene to `changelog-maintenance`.
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for Markdown, help-center, docs-site, or knowledge-base workflows where the
  output teaches someone how to complete a task in the product rather than how the
  underlying system is implemented.
license: MIT
metadata:
  tags: user-guides, tutorials, documentation, onboarding, how-to, faq, help-center, customer-docs, product-education
  platforms: Claude, ChatGPT, Gemini
  version: "2.1.0"
  modernization: 2026-04-13
  hardening: 2026-04-17
---

# User Guide Writing

Use this skill when the deliverable is **customer-facing or admin-facing documentation that helps someone complete a workflow in the product**.

`user-guide-writing` is the documentation-cluster anchor for:
- getting-started / first-success guides
- tutorials and guided walkthroughs
- task-based how-to articles
- FAQs and support-oriented answer sets
- release-facing help updates after shipped UI/workflow changes
- small guide sets that combine one primary page with the minimum supporting companion docs

Read these support docs before choosing the mode or boundary:
- [references/document-modes-and-boundaries.md](references/document-modes-and-boundaries.md)
- [references/mode-structures.md](references/mode-structures.md)
- [references/workflow-checklist.md](references/workflow-checklist.md)
- [references/maintenance-signals.md](references/maintenance-signals.md)

## When to use this skill
- A product needs a getting-started guide that gets a new user to the first successful outcome.
- A feature launch needs a tutorial or how-to article for real product users.
- A help center needs a task-based article, FAQ, or troubleshooting-friendly walkthrough.
- Support pain keeps recurring and the answer should become durable customer-facing documentation.
- A workflow changed and the existing user-facing steps, screenshots, warnings, or prerequisites need to be updated.
- A request really needs one guide plus a tiny companion packet instead of a huge mixed-purpose document.

## When not to use this skill
- **The main job is an internal spec, architecture doc, ADR, runbook, migration plan, or builder-facing implementation guide** → use `technical-writing`.
- **The main job is API reference, SDK docs, webhook docs, developer quickstarts, or developer-portal content** → use `api-documentation`.
- **The main job is release notes, `CHANGELOG.md`, migration announcements, or shipped-change summaries** → use `changelog-maintenance`.
- **The main job is a deck, launch presentation, workshop slide set, or visual review artifact** → use `presentation-builder`.
- **The main job is product positioning, marketing messaging, lifecycle email copy, or launch copy** → use `marketing-automation`.
- **The main job is building in-app onboarding mechanics or product-tour UX** → use the relevant product/UX skill first, then use this skill for the durable written companion docs.

## Instructions

### Step 1: Classify one primary mode
Normalize the request before drafting.

```yaml
user_guide_mode:
  primary_mode: getting-started | tutorial | how-to | faq | release-help-update
  audience: end-user | admin | manager | mixed | unknown
  experience_level: first-time | familiar | advanced | mixed | unknown
  docs_surface: help-center | docs-site | in-app-companion | pdf | unknown
  source_of_truth: product-ui | release-notes | support-tickets | sme-notes | mixed | unknown
  maintenance_need: one-off | recurring | stale-doc-rewrite | launch-critical
  output_shape: single-page | guide-plus-faq | refresh-packet | guide-set | unknown
```

Use one primary mode per run:
- `getting-started` → shortest path to first success
- `tutorial` → guided learning with context and milestones
- `how-to` → one practical task completed quickly
- `faq` → concise repeated questions plus route-outs to deeper guides
- `release-help-update` → patch user-facing docs after shipped UI or workflow change

### Step 2: Confirm audience, task, and route-outs
Answer these before writing:
1. Who will follow the doc, and what role or permissions do they have?
2. What exact task or outcome should they achieve?
3. Which prerequisites, plan limits, or environment assumptions could break the flow?
4. Which neighboring skills must stay out of scope?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| "Write the architecture doc / runbook / migration plan" | `technical-writing` |
| "Write the developer portal / SDK quickstart / webhook docs" | `api-documentation` |
| "Summarize what shipped this release" | `changelog-maintenance` |
| "Write onboarding docs / tutorial / FAQ / help article" | `user-guide-writing` |
| "Make a launch deck / training deck / walkthrough presentation" | `presentation-builder` |

### Step 3: Gather the minimum user-facing evidence
Do not draft from vibes alone. Pull the smallest credible evidence set first:
- current UI labels, navigation, and states
- prerequisites, permissions, and plan / edition assumptions
- expected result after each important step
- likely blockers, empty states, and branching conditions
- screenshots or screenshot placeholders only where they reduce confusion
- support questions, search terms, or recurring failure signals if available
- release changes that made the current guide stale

If details are incomplete, label assumptions explicitly instead of pretending the guide is verified.

### Step 4: Choose the smallest fitting structure
Use [references/mode-structures.md](references/mode-structures.md) and keep only the sections the chosen mode needs.

Rules:
- If the request is one user outcome, prefer a **single page**.
- If the task needs one main guide plus recurring blockers, use **guide plus FAQ**.
- If the real work is patching stale pages after a release, use a **refresh packet** instead of rewriting a whole manual.
- If one draft starts doing onboarding, daily usage, troubleshooting, and release notes all at once, split it into a **small guide set**.

### Step 5: Emit the smallest useful artifact packet
Default output shapes:
- `single-page` → one getting-started guide, tutorial, how-to, or FAQ page
- `guide-plus-faq` → one main guide plus a short FAQ or troubleshooting appendix
- `refresh-packet` → changed steps, stale screenshot list, affected companion docs, and assumptions to verify
- `guide-set` → a bounded set such as getting-started + FAQ or tutorial + how-to follow-up

Do not ship a broad handbook when the request only needs one page and a short sync list.

### Step 6: Apply user-doc writing rules
- **Lead with the task and audience**, not implementation details.
- **Name prerequisites early**: role, permissions, plan limits, data required, browser/app/version assumptions.
- **Prefer observable actions**: what the user clicks, types, sees, and receives.
- **Keep one major outcome per page**.
- **Call out branching conditions** like role-specific UI or alternate paths.
- **Give the user a success check** so they know the task worked.
- **Keep troubleshooting near the task** instead of burying it in a generic appendix.
- **Use screenshots intentionally** at confusing transitions, not after every click.
- **Link outward deliberately**: FAQ → full guide, release-help update → affected articles, getting-started → next task.

### Step 7: Run the maintenance and sync check
Use [references/workflow-checklist.md](references/workflow-checklist.md) and [references/maintenance-signals.md](references/maintenance-signals.md) before finalizing.

Verify:
1. The page type matches the user job.
2. Prerequisites and blockers appear before risky steps.
3. Screenshot placeholders are justified and trackable.
4. Related guides, FAQs, release updates, or support macros that must stay in sync are named.
5. Route-outs to `technical-writing`, `api-documentation`, and `changelog-maintenance` remain explicit when the request drifts.

### Step 8: Return a brief or the finished artifact
Preferred brief shape before full drafting:

```markdown
# User Guide Writing Brief

## Mode
- Primary mode:
- Why it fits:
- Audience:
- Output shape:

## Source material used
- Product truth / UI evidence:
- Support or release signals:
- Assumptions / gaps:

## Planned artifact packet
1. main page
2. companion FAQ / refresh list / sync note

## Writing notes
- Key user outcome:
- Known blockers / branching conditions:
- Route-outs kept out of scope:
```

If the user already asked for the finished artifact, produce the selected page or packet directly with the matching structure.

## Examples

### Example 1: First-success onboarding
**Input**
> Write a getting-started guide for new workspace admins inviting their team and creating the first project.

**Good output direction**
- mode: `getting-started`
- output shape: `single-page`
- include prerequisites, step order, success check, and next steps
- keep internal implementation notes out of scope

### Example 2: Release-driven doc refresh
**Input**
> Update our help-center article for exporting reports because the Export button moved into the Reports header and only admins can choose XLSX now.

**Good output direction**
- mode: `release-help-update`
- output shape: `refresh-packet`
- call out changed UI, role differences, screenshot refreshes, and affected companion docs
- keep release-note summarization out of scope

### Example 3: Support-to-FAQ conversion
**Input**
> Turn these repeated billing support replies into a short FAQ for workspace owners.

**Good output direction**
- mode: `faq`
- output shape: `single-page` or `guide-plus-faq`
- keep answers short and link to the deeper task guide where needed
- surface role / plan caveats early

### Example 4: Boundary with developer docs
**Input**
> Refresh our public webhook quickstart and auth troubleshooting page for external developers.

**Good output direction**
- route to `api-documentation`
- explain that the main job is published developer-facing API docs, not end-user product guidance

## Best practices
1. Choose the page type before writing the body.
2. Prefer one user outcome per page and one primary mode per run.
3. Use the smallest useful packet instead of a giant all-in-one guide.
4. Put prerequisites, permissions, and blockers before the user gets stuck.
5. Keep screenshots intentional and easy to refresh.
6. Use support/search/release signals to decide what to patch next.
7. Route internal docs, API docs, and release notes out instead of stretching the skill boundary.
8. Split mixed-purpose drafts into a guide set when the page starts teaching too many jobs.

## References
- [Diátaxis](https://diataxis.fr/)
- [Google developer documentation style guide](https://developers.google.com/style)
- [Microsoft Writing Style Guide](https://learn.microsoft.com/style-guide/welcome/)
- [GitLab documentation workflow](https://docs.gitlab.com/development/documentation/)
- [Write the Docs — Docs as Code](https://www.writethedocs.org/guide/docs-as-code/)
