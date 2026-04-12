---
title: Skill Support Coverage
created: 2026-04-12
updated: 2026-04-12
type: concept
tags: [skills, skill-quality, graphify]
sources: [graphify-out/GRAPH_REPORT.md]
---

# Skill Support Coverage

## Durable finding
Support coverage is uneven across the `.agent-skills` corpus.

Current structural snapshot from the graph-style scan:
- 89 total skills
- 35 skills with `references/`
- 34 skills with `evals/`

Recent ratchets:
- The React canonical/alias pair both include `evals/`, which raised support coverage in a high-visibility frontend lane without adding a new skill.
- The design-system canonical/alias pass added one new `references/` bundle and two new `evals/` bundles while reducing duplicate frontend metadata.
- The `bmad-gds` modernization pass added both `references/` and `evals/`, showing that cluster anchors can be upgraded without creating another overlapping game skill.
- The marketing canonical/alias pass added the first support bundle for the broad marketing lane while reducing duplicate discovery wording at the same time.
- The `survey` hardening pass added both `references/` and `evals/`, which matters because it upgrades the evidence-quality gate that every later maintenance run depends on.
- The `standup-meeting` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has stronger support for a high-frequency daily coordination ritual instead of only planning-oriented upgrades.
- The `sprint-retrospective` modernization pass added both `references/` and `evals/`, which matters because the PM cluster now has stronger support for reflection, async/hybrid facilitation, and action follow-through instead of relying on a template-only legacy skill.
- The `git-workflow` modernization pass added both `references/` and `evals/`, which matters because a high-frequency CLI/developer-workflow anchor now has durable guidance for local collaboration boundaries, push safety, and recovery instead of only a command dump.
- The environment canonicalization pass added both `references/` and `evals/` to the infrastructure setup pair, which matters because a previously weak duplicate lane now has a clear broader anchor and a narrower config alias.


## Why it matters
- Missing references weaken reuse and make trigger boundaries harder to maintain.
- Missing evals make ratcheting and regression checks harder for future improvement loops.
- Generic legacy skills should usually be upgraded with support files before adding new overlapping skills.

## Operational rule
When a legacy skill is materially upgraded, prefer adding at least one of:
- `references/` for durable heuristics
- `evals/evals.json` for dry-run validation

## Related pages
- [[project-management-cluster]]
- [[game-development-cluster]]
- [[marketing-cluster]]
- [[frontend-skill-canonicalization]]
- [[task-planning-modernization-2026-04-12]]
- [[design-system-canonicalization-2026-04-12]]
- [[bmad-gds-modernization-2026-04-12]]
- [[marketing-skill-canonicalization-2026-04-12]]
