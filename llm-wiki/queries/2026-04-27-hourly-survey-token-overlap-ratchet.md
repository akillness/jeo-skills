---
title: Hourly survey token-overlap ratchet
created: 2026-04-27
updated: 2026-04-27
type: query
tags: [survey, repo-maintenance, quality-gate]
sources:
  - .survey/hourly-skill-candidates-20260427-062544/evidence.json
  - .survey/hourly-skill-candidates-20260427-062544/rtk-summary.md
---

## Question
What low-risk hardening should be added after this hourly run to reduce off-topic recommendation promotion?

## Finding
Broad keyword discovery recovered many high-star repositories, but several kept results were off-topic for lane intent (e.g., generic frameworks matched by incidental tokens). The next ratchet should add an explicit lane-token relevance check before recommendation-grade promotion while keeping raw discovery evidence unchanged.

## Proposed ratchet
1. Add a token-overlap guard for lane intent (`agentic/ai/skill`, `frontend/ui/design-system`, etc.).
2. Require at least one lane-intent token hit in repo full name or description for recommendation-grade keeps.
3. If dropped by this guard, preserve in raw evidence and classify as `low-fit` with explicit counts/examples.

## Why this helps
This keeps recall-wide evidence, improves precision of promoted recommendations, and reduces reviewer burden caused by obvious topical drift.
