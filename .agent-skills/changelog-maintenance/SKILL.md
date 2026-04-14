---
name: changelog-maintenance
description: "Maintain release history and release communication across CHANGELOG.md, version notes, migration updates, developer release notes, customer-facing product notes, and lightweight game patch notes. Use when the main job is turning shipped changes into a durable changelog or audience-appropriate release summary rather than writing a full internal spec, API portal, tutorial, or launch campaign. Triggers on: changelog, release notes, patch notes, migration update, deprecation notes, version notes, what's new, release summary, semantic version, and shipped changes. Route internal specs/runbooks to technical-writing, API portals to api-documentation, end-user tutorials/FAQs to user-guide-writing, release execution to deployment-automation, and broader launch messaging to marketing-automation."
allowed-tools: Read Write Edit Glob Grep
compatibility: >
  Best for docs-as-code repositories, release PR workflows, package/release
  automation, product update hubs, and game/live-ops update notes where the output
  lives in Markdown, docs sites, release entries, or store/news surfaces.
license: MIT
metadata:
  tags: changelog, release-notes, patch-notes, migration, semantic-versioning, documentation, release-communication
  platforms: Claude, ChatGPT, Gemini
  version: "2.0.0"
  modernization: 2026-04-14
---

# Changelog Maintenance

Use this skill when the main job is **turning shipped changes into durable release history or audience-appropriate release communication**.

`changelog-maintenance` is the documentation-cluster anchor for:
- `CHANGELOG.md` upkeep
- versioned release summaries
- migration and deprecation callouts attached to a release
- developer-facing release notes that point to deeper docs
- customer-facing product update notes
- lightweight game patch notes tied to a shipped update

Read these support docs before choosing the mode or boundary:
- [references/modes-and-boundaries.md](references/modes-and-boundaries.md)
- [references/release-note-quality-checklist.md](references/release-note-quality-checklist.md)
- [references/automation-and-source-of-truth.md](references/automation-and-source-of-truth.md)

## When to use this skill
- A repo needs `CHANGELOG.md` updates that summarize meaningful changes instead of raw commit history
- A release needs audience-appropriate notes for developers, customers, or players
- A breaking change or deprecation needs a migration update linked from release history
- A package, app, or live-ops release needs grouped notes (`Added`, `Changed`, `Fixed`, etc.) with the right version framing
- Release automation drafted notes, but the output still needs editorial grouping, source validation, or doc links
- A game update needs lightweight patch notes while larger announcement/marketing work stays elsewhere

## When not to use this skill
- **The main job is writing an internal spec, rollout plan, ADR, or runbook** → use `technical-writing`
- **The main job is publishing developer portal / SDK / API reference docs** → use `api-documentation`
- **The main job is writing end-user tutorials, onboarding docs, screenshots, or FAQs** → use `user-guide-writing`
- **The main job is planning release execution, environments, rollout steps, or rollback mechanics** → use `deployment-automation`
- **The main job is launch copy, campaign messaging, positioning, or GTM coordination** → use `marketing-automation`
- **There is no credible source of truth for what shipped** → gather evidence first instead of fabricating notes from vibes

## Instructions

### Step 1: Classify the release-writing job
Normalize the request into one primary mode before drafting.

```yaml
changelog_mode:
  primary_mode: changelog | release-notes | migration-update | game-patch-notes
  audience: developers | end-users | mixed | players | internal-stakeholders | unknown
  release_scope: patch | minor | major | rolling | unknown
  source_of_truth: prs | commits | issues | release-pr | docs | mixed | unknown
  publishing_surface: changelog-file | github-release | docs-site | in-app-updates | steam-news | mixed | unknown
  automation_context: manual | release-drafter | changesets | release-please | mixed | unknown
```

Choose one primary mode per run:
- `changelog` → durable repo history in `CHANGELOG.md`
- `release-notes` → audience-facing summary of what changed and why it matters
- `migration-update` → changed behavior, deprecations, breaking changes, and next steps
- `game-patch-notes` → lightweight update summary for players or store/news surfaces

### Step 2: Identify the real audience and neighboring artifacts
Before writing, answer four questions:
1. Who will read this first?
2. What action should they take after reading it?
3. Which source of truth proves the change actually shipped?
4. Which neighboring document should carry the deeper detail?

Quick route-out table:

| If the request sounds like... | Use |
|---|---|
| “Write the architecture / rollout / runbook behind the change” | `technical-writing` |
| “Publish endpoint reference or SDK docs for the release” | `api-documentation` |
| “Create tutorial/help-center content showing users how to use the feature” | `user-guide-writing` |
| “Plan the deployment / rollout / rollback steps” | `deployment-automation` |
| “Write the announcement / launch campaign / feature positioning” | `marketing-automation` |
| “Summarize shipped changes in changelog/release/patch-note form” | `changelog-maintenance` |

### Step 3: Gather the smallest truthful evidence set
Do not write release history from memory alone. Pull the smallest credible evidence set first:
- merged PRs / commits / issues included in the release
- linked docs, guides, migration notes, or upgrade instructions
- breaking changes, removals, deprecations, compatibility windows, or rollout caveats
- version bump intent (`major`, `minor`, `patch`) and why it fits
- publishing surface constraints: `CHANGELOG.md`, GitHub Release, docs site, in-product update feed, or Steam/news post
- automation context, if any: Release Drafter, Changesets, release-please, or manual curation

If evidence is incomplete, explicitly label assumptions and missing proof.

### Step 4: Pick the smallest structure that fits the mode
Use the smallest structure that matches the job.

#### A. Changelog mode
Use for durable historical record.

Recommended skeleton:
```markdown
# Changelog

## [Unreleased]

### Added
### Changed
### Deprecated
### Removed
### Fixed
### Security

## [1.4.0] - 2026-04-14
### Added
- ...
```

Rules:
- Prefer meaningful grouped entries over chronological commit dumps
- Include only notable changes
- Keep links to compare ranges/releases if the repo uses them
- If the change needs deeper explanation, link to migration or guide docs instead of bloating the changelog entry

#### B. Release-notes mode
Use for audience-facing summaries.

Recommended skeleton:
```markdown
# Release Notes: <version or release name>

## What's new
## Improvements
## Fixes
## Breaking / important changes
## Links to learn more
```

Rules:
- Lead with user/developer impact, not internal ticket numbers
- Prefer plain language
- Keep entries short enough to scan
- Add links to guides, migration notes, demos, or API docs where needed

#### C. Migration-update mode
Use when compatibility or behavior changed.

Recommended skeleton:
```markdown
# Migration Update: <change>

## What changed
## Who is affected
## Previous behavior
## New behavior
## Required actions
## Timeline / deprecation window
## Links and references
```

Rules:
- Make the required action impossible to miss
- Separate deprecated vs removed behavior
- State deadlines or support windows if known
- Link out to detailed technical or API docs rather than duplicating them

#### D. Game-patch-notes mode
Use for lightweight player-facing update notes.

Recommended skeleton:
```markdown
# Patch Notes - <version / date>

## New content / features
## Balance / tuning
## Fixes
## Known issues or next steps
```

Rules:
- Keep the note lightweight and readable
- Focus on what players will notice
- Route deeper live-ops / launch / event promotion work to `marketing-automation`
- Route build, rollout, and release-process mechanics to `deployment-automation`

### Step 5: Apply editorial rules instead of generic filler
Use these rules aggressively:
- **Do not dump git logs into changelogs.** Summarize notable changes.
- **Group changes logically** (`Added`, `Changed`, `Fixed`, etc.) or by user-facing theme when that serves the audience better.
- **Use plain language** for audience-facing release notes and patch notes.
- **Keep entries short**; longer explanations should live in linked docs.
- **Separate record from promotion**: changelog/release notes summarize what shipped; campaign messaging belongs elsewhere.
- **Separate migration detail from summary**: release notes can flag a breaking change, but migration steps should live in a linked migration section or doc.
- **Preserve trust**: do not imply a feature shipped, works everywhere, or is GA if the evidence only shows partial rollout or draft status.

### Step 6: Handle versioning honestly
Use semantic versioning as an aid, not as cargo-cult output.

Ask:
- Is this breaking existing integrations or workflows? → likely `major`
- Is this additive but backwards compatible? → likely `minor`
- Is this primarily a fix or small improvement? → likely `patch`

If the repo does not truly use semver, do not fake certainty. Document the release scope in plain language instead.

### Step 7: Work well with automation without surrendering judgment
If automation is present:
- **Release Drafter** → good for PR-label grouping; still clean up wording and audience fit
- **Changesets** → good for package/version workflows; still decide what belongs in customer-facing notes
- **release-please** → good for release PRs and version bumps; still validate migration/deprecation framing

Automation can draft the release history. It should not replace editorial boundary decisions.

### Step 8: Validate before publishing
Before finalizing:
1. Check that every claim matches merged/shipped evidence.
2. Remove internal-only jargon, ticket-only entries, and filler like “various improvements”.
3. Confirm links point to the right neighboring docs.
4. Verify the selected mode matches the audience.
5. Make sure breaking changes and deadlines are explicit.
6. If the output grew too large, split summary vs detailed migration/support docs.

## Output format
When responding, prefer this structure:

```markdown
## Release-writing mode
- Mode: changelog | release-notes | migration-update | game-patch-notes
- Audience: ...
- Source of truth: ...
- Neighbor docs to link: ...

## Draft
<actual changelog / release notes / migration update / patch notes>

## Validation notes
- Evidence used:
- Assumptions / missing proof:
- Suggested follow-up docs:
```

## Examples

### Example 1: Repo changelog refresh
Input: “Update `CHANGELOG.md` for v2.4.0 based on the merged PR list and note the breaking auth change.”

Output shape:
- Mode: `changelog`
- Add grouped entries under the released version
- Add a `Deprecated` or `Removed` entry for the auth change
- Link to the migration guide instead of embedding the full procedure

### Example 2: Customer-facing release notes
Input: “Turn these shipped product updates into release notes users will actually read.”

Output shape:
- Mode: `release-notes`
- Plain-language headings like `What’s new`, `Improvements`, `Fixes`
- Links to tutorials, walkthroughs, or help-center updates
- No raw ticket IDs or stack-trace language

### Example 3: Steam patch notes
Input: “Write patch notes for our latest game update and keep it lightweight.”

Output shape:
- Mode: `game-patch-notes`
- Short sections for new content, tuning, and fixes
- Player-facing wording
- Route event promotion / launch beats to `marketing-automation`

## Best practices
1. Prefer durable summaries over raw commit archaeology.
2. Pick one primary audience per artifact.
3. Use links to avoid mixing summary, tutorial, API docs, and migration procedure into one blob.
4. Call out breaking changes and deadlines early.
5. Treat patch notes as a real workflow, not just a renamed changelog.
6. Let automation draft, but do not outsource judgment.

## References
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Release Drafter](https://github.com/release-drafter/release-drafter)
- [Changesets](https://github.com/changesets/changesets)
- [release-please](https://github.com/googleapis/release-please)
- [ProductPlan: How to Write Release Notes Your Users Will Actually Read](https://www.productplan.com/learn/release-notes-best-practices/)
- [Steamworks: Event Type — Small Update / Patch Notes](https://partner.steamgames.com/doc/marketing/event_tools/type_patchnotes?l=english)
- [Steamworks: Updating Your Game — Best Practices](https://partner.steamgames.com/doc/store/updates?l=english)
