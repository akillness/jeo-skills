---
title: OpenContext Trust Packet 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, skill-quality, docs]
sources: [.survey/opencontext-next-ratchet-20260420/triage.md, .survey/opencontext-next-ratchet-20260420/context.md, .survey/opencontext-next-ratchet-20260420/solutions.md, .survey/opencontext-next-ratchet-20260420/platform-map.md, .agent-skills/opencontext/SKILL.md]
---

# OpenContext Trust Packet 2026-04-20

## Question
What is the best bounded next improvement for `opencontext` after the packet-first structural hardening pass already clarified the boundary with wiki, graph, vault, and repo-packer layers?

## Decision
Keep `opencontext` as the active project-memory owner, but ratchet it around a **trustworthy project-memory brief**: make it name the highest-confidence source, surface provenance, and warn when branch/release state may have made a saved note stale.

## Why this won
1. Cross-tool workflow evidence still shows the same real behavior: teams use repo-local markdown (`CLAUDE.md`, rules files, handoff docs, memory banks) because they need explicit project memory that survives sessions.
2. The remaining pain is not “which memory layer exists?” but “which artifact should the next agent trust right now?” especially when README, handoff notes, and previous agent summaries overlap.
3. The current `opencontext` lane already owns active project memory cleanly, so the next win was better trust/freshness handling, not another adjacent memory wrapper.
4. Repo packers, repo maps, and assistant-native rules all help cold starts, but they still do not settle precedence, provenance, or branch freshness for active handoffs.

## Accepted changes
- Added explicit trust-check guidance to `opencontext/SKILL.md` for precedence, provenance, and freshness before loading or searching memory.
- Expanded the brief/output contract so responses include a highest-confidence source and branch/freshness warning when overlapping notes exist.
- Added `references/trust-precedence-and-freshness.md`.
- Expanded `evals/evals.json` with a release-branch conflict case.
- Synced `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`.

## Rejected changes
- Adding another memory or handoff wrapper.
- Re-broadening `opencontext` into a generic memory-layer lecture.
- Refreshing graph outputs for a wording-only ratchet that did not materially change repo structure.

## Durable boundary
`opencontext` should answer: **what should the next agent load, what source wins if notes overlap, what stale-risk exists, and what compact note should we leave behind?**
If the need becomes long-lived narrative knowledge, structure graphs, human vault workflows, or one-shot repo packing, route out.

## Related pages
- [[persistent-memory-cluster]]
- [[opencontext-structural-hardening-2026-04-19]]
- [[graphify-structural-hardening-2026-04-19]]
- [[obsidian-cli-structural-hardening-2026-04-19]]
