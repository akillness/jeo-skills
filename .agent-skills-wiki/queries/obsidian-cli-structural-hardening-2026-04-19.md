---
title: Obsidian CLI Structural Hardening 2026-04-19
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, trigger-design, skill-quality, survey, docs]
sources: [.survey/obsidian-cli-structural-hardening-20260419/context.md, .survey/obsidian-cli-structural-hardening-20260419/solutions.md, .survey/obsidian-cli-structural-hardening-20260419/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Obsidian CLI Structural Hardening 2026-04-19

## Decision
The best bounded improvement was to harden `obsidian-cli` into a routing-first desktop-automation front door instead of adding another note-automation wrapper.

## Why
- Survey evidence showed users actually split across four jobs: official CLI command/TUI use, official `obsidian://` handoff, plugin/API-heavy automation that exceeds first-party coverage, and headless sync/publish without the desktop app.
- The old skill mixed those jobs into one command tour and carried stale install guidance.
- Graph refresh confirmed support coverage is already complete across the repo, so the higher-value move was shrinking an existing dense router, not adding another adjacent skill.

## Accepted changes
- Rewrote `obsidian-cli/SKILL.md` as a routing-first front door.
- Added `references/intake-packets-and-route-outs.md`.
- Refreshed install/troubleshooting guidance against current official docs (`1.12.7+`, macOS `/usr/local/bin/obsidian`, Linux `~/.local/bin/obsidian`).
- Added eval coverage for plugin/API route-out cases.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, README, README.ko, and setup prompt discovery wording.

## Rejected alternatives
- Creating a separate generic note-automation wrapper.
- Pretending first-party CLI covers headless Sync/Publish or richer external CRUD/frontmatter/workspace automation.
- Keeping the old packaging-specific troubleshooting guesses after official install behavior changed.

## Durable boundary
- `obsidian-cli` owns desktop Obsidian control and official URI handoff.
- `llm-wiki`, `opencontext`, and `graphify` stay on the narrative/project/structural memory side.
- `obsidian-plugin` stays on plugin development and submission, not desktop operations.

## Related pages
- [[persistent-memory-cluster]]
- [[skill-support-coverage]]
- [[graphify-structural-hardening-2026-04-19]]
- [[opencontext-modernization-2026-04-15]]
