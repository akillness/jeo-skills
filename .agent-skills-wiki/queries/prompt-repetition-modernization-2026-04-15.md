---
title: Prompt Repetition modernization 2026-04-15
created: 2026-04-15
updated: 2026-04-15
type: query
tags: [survey, trigger-design, skill-quality, consolidation, docs]
sources: [.survey/prompt-repetition-modernization-20260415/triage.md, .survey/prompt-repetition-modernization-20260415/context.md, .survey/prompt-repetition-modernization-20260415/solutions.md, .agent-skills/prompt-repetition/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# Prompt Repetition modernization 2026-04-15

## Question
Should the repo treat `prompt-repetition` as a broad auto-apply prompt-engineering trick, add another nearby prompt/context wrapper, or tighten the existing skill into a bounded decision-first router?

## Answer
The best bounded move is to **tighten `prompt-repetition` into a decision-first router** for non-reasoning long-context retrieval, options-first MCQ, and position-sensitive lookup tasks — and explicitly route broader context-engineering, retrieval, and reasoning-model decisions elsewhere.

## Why this was the right ratchet
- Survey evidence supported a narrower scope than the legacy skill claimed: the strongest primary-source evidence was the non-reasoning arXiv paper, not a universal prompt-engineering rule.
- The existing repo gap was not "missing another prompt trick skill" but a lack of trigger precision, cost guardrails, and route-outs.
- Indexed community discussion treated repetition as an interesting targeted hack, while the broader ecosystem still framed context engineering and retrieval as the bigger levers for many long-context failures.

## Accepted changes
- Rewrote `prompt-repetition` around task-shape classification, token-budget checks, smallest-useful intervention, explicit opt-outs, and route-outs.
- Added `references/evidence-and-boundaries.md`, `references/operator-checklist.md`, and `evals/evals.json`.
- Refreshed `SKILL.toon`, `skills.json`, `skills.toon`, README / README.ko, setup prompt, and the structural graph output so discovery surfaces reflect the narrower positioning.
- Dropped weak universal framing such as blanket auto-apply language and unsupported spillover claims.

## Rejected changes
- Adding another overlapping long-context or prompt-hacks skill
- Keeping prompt repetition as a broad always-on optimization layer
- Letting the skill claim to replace retrieval, context engineering, or reasoning-model choice

## Durable takeaway
`prompt-repetition` should stay as a **bounded experiment skill** in the repo: useful when a lightweight or non-reasoning model loses late prompt information, but not a substitute for better context selection, retrieval design, or reasoning depth.

## Related pages
- [[skill-support-coverage]]
- [[survey-evidence-recovery-2026-04-12]]
- [[compact-variant-gap-2026-04-15]]
