---
title: Remotion Video Production Support Hardening 2026-04-16
created: 2026-04-16
updated: 2026-04-16
type: query
tags: [skills, consolidation, survey, docs, game-dev]
sources: [.survey/remotion-video-production-support-hardening-20260416/triage.md, .survey/remotion-video-production-support-hardening-20260416/context.md, .survey/remotion-video-production-support-hardening-20260416/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Remotion Video Production Support Hardening — 2026-04-16

## Question
What is the best bounded next improvement for the creative-media lane after the frontend alias support PR merged?

## Answer
Harden `remotion-video-production` in place with a tiny alias-side `references/` packet, refreshed compact wording, and one route-out eval that explicitly sends spreadsheet/API-style bulk generation back to broader `video-production` modes.

## Why this won
- Cross-domain repo scan showed the highest-value remaining support gaps had collapsed to one creative-media alias holdout (`remotion-video-production`) plus one non-media eval holdout (`ralph`).
- Browser-rendered primary page evidence from Remotion confirmed that explicit Remotion asks still carry stack-specific concepts like parameterized videos, player embedding, and code-first rendering, so the alias still needs lightweight stack-aware guidance (<https://www.remotion.dev/docs>, <https://www.remotion.dev/docs/parameterized-rendering>, <https://www.remotion.dev/docs/player/>).
- Comparator evidence from Shotstack and Creatomate showed why route-outs still matter: many “Remotion” asks are really bulk automation or template/API problems (<https://shotstack.io/docs/guide/>, <https://creatomate.com/docs/fundamentals/getting-started/introduction>).
- The graph refresh showed the bounded win was support symmetry and route clarity, not another video skill or another doc-surface rewrite.

## Accepted changes
- Added `references/alias-routing.md` to explain exact-name compatibility and canonical handoff to `video-production`
- Added `references/remotion-route-outs.md` to preserve code-first Remotion cues while keeping template/API, repurposing, and manual-finish route-outs explicit
- Refreshed `SKILL.md` and `SKILL.toon` so the alias now advertises compatibility-first behavior instead of sounding like a standalone Remotion production skill
- Expanded `evals/evals.json` with a bulk-generation prompt that must reject an unnecessary Remotion codebase
- Refreshed graph artifacts and wiki notes; README / README.ko / setup prompt were reviewed and left unchanged because their current canonical-vs-alias wording was already accurate

## Rejected changes
- Reviving `remotion-video-production` as a peer to `video-production`
- Adding another media/video wrapper instead of finishing the alias support gap
- Rewriting top-level docs just to mention support-file internals that do not materially change discovery wording

## Related pages
- [[creative-media-cluster]]
- [[skill-support-coverage]]
- [[video-production-canonicalization-2026-04-14]]
