---
title: JEO Structural Hardening 2026-04-20
created: 2026-04-20
updated: 2026-04-20
type: query
tags: [skills, survey, trigger-design, graphify]
sources: [.survey/jeo-structural-hardening-20260420/triage.md, .survey/jeo-structural-hardening-20260420/context.md, .survey/jeo-structural-hardening-20260420/solutions.md, .survey/jeo-structural-hardening-20260420/platform-map.md, .agent-skills/jeo/SKILL.md, graphify-out/GRAPH_REPORT.md]
---

# JEO structural hardening — 2026-04-20

## Question
What is the best bounded next improvement for `jeo` after support coverage and prior structural hardening work are already in place?

## Answer
Tighten `jeo` into a **packet-first orchestration front door** instead of letting it remain a dense all-in-one orchestration manual.

## Why this won
- The graph layer still flagged `jeo` as one of the repo's oversized front-door skills.
- Survey evidence across Claude Code, Codex CLI, Gemini CLI, LangGraph, CrewAI Flows, Mastra, AutoGen, OpenHands, Anthropic guidance, and Stack Overflow usage patterns pointed toward the same shape: thin front door, explicit workflow contract, durable state, and honest route-outs.
- The repo already has specialist ownership for plan review, runtime execution, browser verification, UI annotation, and trust posture. Tightening `jeo` preserved that structure instead of adding another wrapper.

## Accepted change shape
- Keep `jeo` responsible for the shared workflow contract: packet choice, phase invariants, `.jeo` ledger truth, resumable state, and completion evidence.
- Move routing detail into one new intake/route-out reference instead of keeping it in the main skill body.
- Keep runtime-specific setup and hook detail in existing references and runtime-specific sibling skills.
- Refresh compact/discovery surfaces so the repo advertises `jeo` as a packet-first front door rather than a generic integrated mega-skill.

## Rejected alternatives
- Adding another orchestration wrapper for plan + runtime + browser work.
- Expanding `jeo` with more runtime-specific hook/config detail.
- Treating Claude, Codex, and Gemini as symmetric at the hook/config layer.
- Pulling browser verification or submit-gated UI review mechanics back into `jeo` instead of routing to `agent-browser` and `agentation`.

## Durable note
For high-degree orchestration skills in this repo, the next good ratchet after support coverage is usually **contract shrinkage + route-out clarity**, not another adjacent wrapper skill.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[omc-structural-hardening-2026-04-19]]
- [[skill-autoresearch-structural-hardening-2026-04-19]]
