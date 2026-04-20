---
title: Skill Standardization Alias Support Sync
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, consolidation, skill-quality, survey]
sources: [.survey/skill-standardization-alias-support-sync-20260420/triage.md, .survey/skill-standardization-alias-support-sync-20260420/context.md, .survey/skill-standardization-alias-support-sync-20260420/solutions.md, .survey/skill-standardization-alias-support-sync-20260420/loop-charter.md, .survey/skill-standardization-alias-support-sync-20260420/loop-results.md, .agent-skills/skill-standardization/SKILL.md, .agent-skills/skill-standardization/SKILL.toon, .agent-skills/skill-standardization/references/working-modes.md, .agent-skills/skill-standardization/evals/evals.json, graphify-out/GRAPH_REPORT.md]
---

# Skill Standardization Alias Support Sync

## Question
What is the best bounded next improvement for `skill-standardization` after repeated canonical-vs-alias hardening runs have already completed support coverage in multiple lanes?

## Answer
Teach `skill-standardization` to treat alias-side support docs as first-class derived surfaces whenever a compatibility alias mirrors the canonical contract. The winning move is not another validator or another alias helper skill; it is a small ratchet that makes canonical-vs-alias maintenance explicitly review alias-side references/checklists/examples alongside `SKILL.toon`, manifests, and README/setup surfaces.

## Why this won
- The repo now uses alias-side packets in several mature lanes (`frontend-design-system`, `vercel-react-best-practices`, `remotion-video-production`, `marketing-skills-collection`), so stale alias docs can shape behavior before the canonical skill opens.
- The graph report says support coverage is complete and the best next wins are bounded front-door ratchets, not new wrappers (`graphify-out/GRAPH_REPORT.md`).
- The existing scripts remain useful guardrails, but they cannot detect semantic drift inside alias-side support docs.
- Encoding the rule in `skill-standardization` is more transferable than relying on wiki memory from older alias hardening runs.

## Accepted change shape
- Keep the existing `SKILL.md` ratchet that adds alias-side support sync to duplicate handling, derived-surface sync, and best-practice guidance.
- Update `references/working-modes.md` so both canonicalization mode and derived-surface review explicitly include alias-side support packets.
- Expand `evals/evals.json` with a prompt that fails the pass if the maintainer only refreshed `skills.json`, README/setup, and `SKILL.toon`.
- Refresh `SKILL.toon` so compact discovery guidance matches the stronger rule.

## Rejected alternatives
- Building a new validator for alias-side docs before the meta-skill contract is explicit.
- Opening a new alias-maintenance skill instead of strengthening the repo’s standardization front door.
- Updating README / README.ko / setup prompt for this run when the discovery wording for `skill-standardization` did not materially change.

## Durable note
Once a repo adopts canonical skills plus thin compatibility aliases, alias-side support docs become part of the live contract. Standardization guidance should treat them like derived surfaces, not like optional commentary remembered only through prior wiki entries.

## Related pages
- [[skill-standardization-structural-hardening-2026-04-17]]
- [[skill-standardization-validator-hardening-2026-04-19]]
- [[skill-support-coverage]]
- [[frontend-alias-support-hardening-2026-04-16]]
- [[marketing-skills-collection-support-hardening-2026-04-16]]
