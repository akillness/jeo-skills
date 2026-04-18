---
title: git-submodule structural hardening 2026-04-18
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, consolidation, trigger-design, skill-quality, docs]
sources: [.survey/git-submodule-structural-hardening-20260418/triage.md, .survey/git-submodule-structural-hardening-20260418/context.md, .survey/git-submodule-structural-hardening-20260418/solutions.md, .survey/git-submodule-structural-hardening-20260418/loop-charter.md, .survey/git-submodule-structural-hardening-20260418/loop-results.md, .agent-skills/git-submodule/SKILL.md, .agent-skills/git-submodule/references/mode-packets-and-hosted-constraints.md, graphify-out/GRAPH_REPORT.md]
---

# git-submodule structural hardening 2026-04-18

## Decision
The best bounded developer-workflow improvement was hardening the existing `git-submodule` skill in place rather than adding another Git wrapper or splitting CI/hosted-submodule edge cases into a separate skill.

## Why this won
- `git-submodule` was still on the graph watchlist at 293 lines even though it already had full support coverage.
- Primary-source Git, GitHub Actions, GitHub Pages, and issue evidence all pointed to the same durable operator truths: recursive bootstrap, pinned commit vs tracked branch, detached `HEAD`, and hosted/private-submodule constraints.
- Those truths belong to the same operator lane, but the old front door was carrying too many mode-specific command packets inline.

## Accepted changes
- Shrunk `git-submodule/SKILL.md` from 293 to 208 lines.
- Added `references/mode-packets-and-hosted-constraints.md` so mode-specific commands and GitHub Pages / URL-drift constraints live in support material instead of the front door.
- Added a `hosted-constraint` mode for public-`https://` GitHub Pages limits and similar hosted-platform restrictions.
- Expanded eval coverage with a GitHub Pages private-submodule boundary case.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` to keep discovery surfaces truthful.
- Refreshed graph artifacts so the watchlist no longer treats `git-submodule` as oversized.

## Rejected alternatives
- Creating a new Git checkout/auth helper skill just for private submodules in CI.
- Letting `git-submodule` absorb generic Git history repair already owned by `git-workflow`.
- Treating package-manager/library delivery as a submodule problem instead of routing it to `npm-git-install` or the relevant package-management lane.

## Durable boundary notes
- `git-submodule` should stay distinct from [[developer-workflow-cluster]] peers: `git-workflow`, `workflow-automation`, `system-environment-setup`, and `npm-git-install`.
- Hosted-platform constraints are part of the same skill only when they materially affect submodule checkout or visibility semantics; broader hosting/admin work still belongs elsewhere.
- Support coverage is already complete across the repo, so the durable maintenance move remains dense-anchor cleanup plus discovery-surface sync, not adding more wrapper skills.

## Related pages
- [[developer-workflow-cluster]]
- [[skill-support-coverage]]
- [[git-submodule-modernization-2026-04-15]]
- [[git-workflow-structural-hardening-2026-04-18]]
