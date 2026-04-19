---
title: scrapling structural hardening
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, survey, trigger-design, skill-quality, docs, graphify]
sources: [.survey/scrapling-structural-hardening-20260419/triage.md, .survey/scrapling-structural-hardening-20260419/context.md, .survey/scrapling-structural-hardening-20260419/solutions.md, graphify-out/GRAPH_REPORT.md]
---

# scrapling structural hardening

## Question
What is the best bounded next improvement for `scrapling` now that support coverage is already complete but the skill still sits on the oversized front-door watchlist?

## Answer
Shrink `scrapling` into a routing-first front door. The durable win is not another scraping wrapper and not more feature inventory. The skill should ask for one intake packet first — target class, rendering need, protection level, output shape, and crawl scope — then route users to the lightest workable Scrapling mode: parser-only, HTTP fetch, dynamic browser, stealth escalation, CLI/MCP, or spiders.

## Why this beat alternatives
- `graphify-out/GRAPH_REPORT.md` still listed `scrapling` on the oversized watchlist before this run.
- Survey evidence showed users do not start with one magic scraping interface; they move from parser or HTTP to browser or stealth only when evidence requires it.
- The real competition is not another wrapper skill. It is mode confusion between parser-first tools, browser automation, crawler frameworks, managed unblockers, and agent-facing web APIs.
- Support coverage was already complete, so the best bounded change was front-door hardening, not another support-only pass.

## Accepted changes
- Rewrite `scrapling/SKILL.md` around intake-packet routing and honest route-outs.
- Add `references/intake-packets-and-route-outs.md`.
- Expand `evals/evals.json` with direct-API and managed-unblocker route-out cases.
- Refresh `SKILL.toon`, `skills.json`, `skills.toon`, `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md` so discovery surfaces advertise the sharper contract.
- Refresh `graphify-out/` so structural memory reflects that `scrapling` no longer behaves like a generic feature tour.

## Rejected changes
- Adding another generic scraping/browser wrapper.
- Pretending `StealthyFetcher` is a guaranteed answer for protected targets.
- Forcing DOM scraping when direct API/request interception is the real source of truth.
- Treating spiders or MCP as the default path for ordinary one-page extraction.

## Structural result
- `scrapling/SKILL.md` dropped from 319 lines to 264 lines.
- The skill now matches the repo’s routing-first pattern more closely: classify one packet, choose the lightest workable mode, and route honestly when Scrapling is not the best layer.
- Discovery and graph surfaces now describe `scrapling` as a mode-selection anchor instead of a broad scraping feature tour.

## Links
- [[skill-support-coverage]]
- [[survey-artifact-validator-hardening-2026-04-19]]
