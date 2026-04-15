---
title: Marketing Skills Collection Support Hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, skill-quality, consolidation, trigger-design, marketing, docs, graphify, survey]
sources: [.survey/marketing-skills-collection-support-hardening-20260416/triage.md, .survey/marketing-skills-collection-support-hardening-20260416/context.md, .survey/marketing-skills-collection-support-hardening-20260416/solutions.md, graphify-out/GRAPH_REPORT.md, .agent-skills/marketing-skills-collection/SKILL.md, .agent-skills/marketing-skills-collection/SKILL.toon, .agent-skills/marketing-automation/SKILL.toon]
---

# Marketing Skills Collection Support Hardening 2026-04-16

## Question
What is the best bounded next improvement for `marketing-skills-collection` after the earlier canonicalization pass?

## Answer
Keep the architecture exactly the same — `marketing-automation` stays canonical and `marketing-skills-collection` stays a thin compatibility alias — but finish the migration by adding a tiny alias support packet and syncing the compact discovery layer away from the obsolete 23-sub-skill framing.

## Accepted changes
- Added `marketing-skills-collection/references/alias-resolution-checklist.md` so legacy-name handling stays explicit without reopening the whole canonical skill.
- Added `marketing-skills-collection/references/legacy-intake-and-route-outs.md` so messy legacy asks still collapse into the canonical marketing brief and specialist game-launch work routes to `steam-store-launch-ops`.
- Hardened `marketing-skills-collection/SKILL.md` around smallest-support-packet usage and explicit route-outs.
- Expanded alias eval coverage with a game-store launch route-out case.
- Refreshed `marketing-automation/SKILL.toon`, `marketing-skills-collection/SKILL.toon`, and `.agent-skills/skills.toon` so the runtime discovery surface now matches the canonical-router + compatibility-alias model.
- Refreshed `graphify-out/` so structural memory no longer lists `marketing-skills-collection` as a references holdout.

## Rejected alternatives
- Re-promoting the alias into a peer broad-marketing generator.
- Adding another general marketing wrapper.
- Forcing a mode-locked marketing alias pattern like the Remotion lane; the marketing alias is naming-based, not stack-based.
- Big docs/setup churn when the top-level README/setup descriptions were already accurate enough.

## Durable finding
The highest-leverage improvement was not another marketing concept or another long support bundle. It was closing the last migration gaps: give the alias a small packet that teaches safe canonical resolution, and make sure compact discovery surfaces stop advertising the old worldview.

## Related pages
- [[marketing-cluster]]
- [[skill-support-coverage]]
- [[marketing-skill-canonicalization-2026-04-12]]
