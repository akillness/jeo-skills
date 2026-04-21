---
title: Video Production Canonicalization 2026-04-14
created: 2026-04-14
updated: 2026-04-14
type: query
tags: [skills, consolidation, survey, docs]
sources: [.survey/video-production-canonicalization-20260414/triage.md, .survey/video-production-canonicalization-20260414/context.md, .survey/video-production-canonicalization-20260414/solutions.md]
---

# Video Production Canonicalization — 2026-04-14

## Question
What is the best bounded improvement for the duplicate `video-production` / `remotion-video-production` pair in the creative-media lane?

## Answer
Canonicalize `video-production` as the repo's programmable-video / automated-video anchor, then narrow `remotion-video-production` into a compatibility alias for explicit Remotion naming and legacy setup surfaces.

## Why this won
- Web/product evidence showed the lane is broader than Remotion alone: Remotion, Shotstack, and Creatomate all describe repeatable, dynamic, API- or code-driven video generation.
- Repo-local evidence showed both entries had identical catalog descriptions, so discovery surfaces could not express a role difference.
- This preserves the most discoverable generic name while still catching exact Remotion queries.
- Adding support bundles to the canonical skill is more useful than creating another adjacent media skill.

## Accepted changes
- Rewrote `video-production` into a production-mode selector for code-first, template/API, repurposing, and manual-finish hybrid workflows
- Narrowed `remotion-video-production` into a compatibility alias that resolves to the canonical skill with code-first mode selected
- Added `references/` + `evals/` support to the canonical skill and `evals/` coverage to the alias
- Updated README / README.ko / setup prompt / `skills.json` so discovery surfaces reflect the canonical-vs-alias relationship

## Rejected changes
- Keeping both skills as equal peers with the same description
- Adding a third media skill instead of consolidating the pair
- Pretending the lane is only about Remotion and ignoring template/API or repurposing workflows

## Related pages
- [[creative-media-cluster]]
- [[skill-support-coverage]]
