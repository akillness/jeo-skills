---
title: OHMG modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [skills, survey, consolidation, trigger-design, skill-quality, graphify]
sources: [.survey/ohmg-modernization-20260415/context.md, .survey/ohmg-modernization-20260415/solutions.md, .survey/ohmg-modernization-20260415/platform-map.md, .agent-skills/ohmg/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# OHMG modernization — 2026-04-15

## Decision
Modernize `ohmg` into the **Gemini / Antigravity-facing entrypoint for `oh-my-agent`** instead of leaving it as a stale Gemini-only framework wrapper or creating another orchestration skill.

## Why this won
- The local skill still used old `oh-my-ag` naming, legacy `.agent/` paths, and outdated command language.
- Upstream `first-fluke/oh-my-agent` is now a portable `.agents`-based harness with generated Gemini / Claude / Codex surfaces and explicit native-vs-fallback dispatch rules.
- `omc` and `omx` already own the vendor-first runtime overlays, so the right boundary for `ohmg` is portable harness adoption from the Gemini / Antigravity side.

## Accepted changes
- Rewrite `ohmg` around `oh-my-agent` / `oma`, `.agents` as the source of truth, generated vendor views, and the Gemini-vs-Antigravity capability split.
- Add `references/` docs for installation/layout, runtime boundaries, and workflow/command packets.
- Add `evals/evals.json` so future runs can catch drift in naming, routing, and Antigravity capability claims.
- Update `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, and `.agent-skills/skills.json` so discovery surfaces reflect the sharper role.
- Refresh the structural graph and record the orchestration-cluster boundary in the wiki.

## Rejected changes
- Adding another Gemini/portable orchestration wrapper instead of fixing `ohmg`
- Copying the full `omc` or `omx` mode catalogs into `ohmg`
- Pretending Antigravity and Gemini have identical custom subagent behavior

## Durable takeaway
For fast-moving platform skills, the better maintenance move is usually: **fix the platform anchor, add support files, update discovery surfaces, and record the cluster boundary**. Otherwise the repo accumulates overlapping wrappers and stale product names.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
