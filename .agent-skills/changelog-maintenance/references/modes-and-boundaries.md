# Changelog / Release-Notes Modes and Boundaries

## Core split
`changelog-maintenance` owns the **release-history artifact** and the **release-summary artifact**.

That includes:
- `CHANGELOG.md`
- GitHub/GitLab release notes
- migration / deprecation summaries attached to a release
- customer-facing “what shipped” notes
- lightweight game patch notes

It does **not** own every neighboring document.

## Route-outs

| If the deeper artifact is... | Route to |
|---|---|
| internal spec / design doc / ADR / runbook / rollout procedure | `technical-writing` |
| API reference, SDK docs, webhook guide, integration docs | `api-documentation` |
| tutorial, onboarding guide, FAQ, help-center walkthrough | `user-guide-writing` |
| deployment steps, rollback execution, environment promotion | `deployment-automation` |
| launch messaging, campaign copy, feature marketing, GTM packaging | `marketing-automation` |

## Mode chooser

### 1. `changelog`
Use when the durable source is `CHANGELOG.md` or an equivalent release-history file.

Best for:
- repo history
- compare links
- grouped notable changes
- long-term historical lookup

### 2. `release-notes`
Use when the artifact is meant to be read by developers, admins, or end users after a release.

Best for:
- “what’s new” pages
- in-app update notes
- GitHub Release text
- customer-facing update posts with doc links

### 3. `migration-update`
Use when compatibility changed and readers need explicit next steps.

Best for:
- deprecation announcements
- API or behavior changes
- renamed config keys, removed endpoints, changed defaults
- upgrade windows and deadlines

### 4. `game-patch-notes`
Use when the update is lightweight and player-facing.

Best for:
- Steam patch notes
- live-ops update summaries
- balance changes and fixes
- concise update notes attached to a shipped build

## Common failure modes
- Treating a changelog like a commit archive
- Treating release notes like launch copy
- Hiding breaking changes in a generic “Changed” bullet
- Mixing patch notes, tutorials, and rollout instructions into one blob
- Writing every artifact for “everyone” instead of one primary audience
