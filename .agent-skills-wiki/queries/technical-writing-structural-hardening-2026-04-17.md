---
title: Technical-writing structural hardening
created: 2026-04-17
updated: 2026-04-17
type: query
tags: [skills, skill-quality, trigger-design, docs, survey, graphify]
sources: [.survey/technical-writing-structural-hardening-20260417/triage.md, .survey/technical-writing-structural-hardening-20260417/context.md, .survey/technical-writing-structural-hardening-20260417/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# Technical-writing structural hardening

## Summary
The best bounded documentation-cluster improvement after the `api-documentation` merge was shrinking `technical-writing` into a cleaner routing-first internal-docs anchor instead of adding another documentation wrapper or merging it into neighboring skills.

## Why this won
- `technical-writing` was still on the oversized-front-door watchlist at 320 lines even after its earlier modernization.
- The lane boundary was already right, so the next win was structural cleanup: remove duplicated mode skeletons from the front door, fix the malformed route-out area, and keep one-primary-mode discipline easy to scan.
- The graph continued to show that support coverage is already complete repo-wide, so the higher-value move was dense-anchor cleanup rather than new-skill expansion.

## Changes accepted
- Shrunk `.agent-skills/technical-writing/SKILL.md` from 320 lines to 220 while preserving the internal-docs boundary.
- Added `references/mode-structures.md` so reusable mode skeletons live in a support packet instead of bloating the front door.
- Refreshed `SKILL.toon` and expanded eval coverage with explicit `api-documentation` and `changelog-maintenance` boundary cases.
- Refreshed `graphify-out/` so the documentation-cluster structural note reflects the new dense-anchor cleanup.

## Changes rejected
- Adding another internal-docs wrapper.
- Merging the lane into `api-documentation`, `user-guide-writing`, or `changelog-maintenance`.
- Re-expanding the front door with more template bulk instead of moving reusable structure into support docs.
- Updating README / README.ko / setup prompt just for this pass when the top-level discovery wording stayed materially accurate.

## Durable boundary note
Keep `technical-writing` focused on internal technical artifacts that enable engineering or operator action. If the audience becomes external developers, end users, release-note readers, deck reviewers, or GTM stakeholders, route out immediately.

## Related pages
- [[documentation-cluster]]
- [[skill-support-coverage]]
- [[technical-writing-modernization-2026-04-13]]
- [[api-documentation-structural-hardening-2026-04-17]]
