---
title: Default Operating Rules Memory Update 2026-04-22
created: 2026-04-22
updated: 2026-04-22
type: query
tags: [skills, trigger-design, skill-quality, graphify, docs]
sources: [setup-all-skills-prompt.md, .omc/project-memory.json, graphify-out/GRAPH_REPORT.md, .agent-skills-wiki/index.md]
---

# Default Operating Rules Memory Update 2026-04-22

## Question
How should `setup-all-skills-prompt.md` and repo-local memory be aligned so this repository consistently follows one default operating sequence centered on `$ooo`, `$graphify`, `$rtk`, `$obsidian-cli`, and `$llm-wiki`?

## Decision
Promote the five-skill sequence **`$ooo → $graphify → $rtk → $obsidian-cli → $llm-wiki`** into the repo's default operating rail, then store the same rule in project memory so future runs inherit it as a durable instruction rather than a one-off prompt edit.

## Why this won
1. The old Step 6 described a graphify/rtk/obsidian/wiki loop but skipped the spec-first control layer that already exists in `ooo`, so the repo had persistence steps without an explicit contract-first front door.
2. `graphify-out/GRAPH_REPORT.md` still shows `setup-all-skills-prompt.md` as one of the highest-degree maintenance nodes, so workflow wording changes here are structurally important and should be mirrored into durable memory.
3. The repository already keeps a local wiki and `.omc/project-memory.json`, so the cheapest truthful way to make the rule sticky was to update both surfaces instead of inventing another memory wrapper.
4. The best operating rule is an ordered default rail, not a claim that every skill must run on every trivial prompt.

## Accepted changes
- Rewrote Step 6 in `setup-all-skills-prompt.md` around the five-skill default operating sequence.
- Added explicit rule text for when each step should own the next move and when it should not be forced.
- Stored the same instruction in `.omc/project-memory.json` under `userDirectives`.
- Filed this decision into `.agent-skills-wiki/queries/`, then updated `index.md` and `log.md`.

## Rejected changes
- Keeping the old post-processing loop without the `$ooo` control layer.
- Treating `$graphify`, `$obsidian-cli`, or `$llm-wiki` as mandatory on every trivial prompt.
- Adding another memory-specific wrapper when the repo already has working wiki and project-memory surfaces.

## Durable boundary
- `$ooo` owns clarification, frozen acceptance criteria, and verified completion loops.
- `$graphify` owns durable structure and relationship tracing.
- `$rtk` owns compact shell execution output.
- `$obsidian-cli` owns official desktop Obsidian persistence and URI handoff.
- `$llm-wiki` owns durable markdown knowledge filing and retrieval discipline.

## Related pages
- [[persistent-memory-cluster]]
- [[graphify-structural-hardening-2026-04-19]]
- [[obsidian-cli-structural-hardening-2026-04-19]]
- [[opencontext-trust-packet-2026-04-20]]
