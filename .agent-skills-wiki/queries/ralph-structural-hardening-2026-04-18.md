---
title: ralph structural hardening
created: 2026-04-18
updated: 2026-04-18
type: query
tags: [skills, consolidation, trigger-design, skill-quality, graphify, survey]
sources: [.survey/ralph-structural-hardening-20260418/triage.md, .survey/ralph-structural-hardening-20260418/context.md, .survey/ralph-structural-hardening-20260418/solutions.md, .survey/ralph-structural-hardening-20260418/platform-map.md, .survey/ralph-structural-hardening-20260418/loop-charter.md, graphify-out/GRAPH_REPORT.md, .agent-skills/ralph/SKILL.md, .agent-skills/ralph/references/platform-setup.md, .agent-skills/ralph/references/runtime-boundaries.md, docs/ralph/README.md]
---

# ralph structural hardening

## Question
What is the best bounded next improvement for `ralph` after support coverage was completed and the graph still showed it as the most oversized front-door skill?

## Answer
Harden `ralph` in place instead of adding another orchestration wrapper. The durable win is to shrink the front door into a cleaner spec-first method anchor, move runtime-ownership detail into references, and correct stale Codex guidance so the skill stops implying that portable method ownership and runtime-native execution belong to the same surface.

## Why this won
- `graphify-out/GRAPH_REPORT.md` still flagged `ralph` as the top oversized front door at 499 lines before this run.
- The core orchestration cluster already has enough neighbors: `omc`, `omx`, `ohmg`, `jeo`, and `ralphmode` cover runtime, integrated delivery, harness, and permission layers.
- Survey evidence showed a real mismatch between current official Codex docs and older repo-local compensation-only wording.
- The better transferable improvement was boundary truthfulness, not another wrapper skill.

## Accepted changes
- Shrink `ralph/SKILL.md` from 499 lines to 236 lines.
- Add `references/runtime-boundaries.md`.
- Rewrite `references/platform-setup.md` to acknowledge Codex native experimental hooks while keeping the current local fallback helper truthful.
- Refresh `SKILL.toon`, `evals/evals.json`, `docs/ralph/README.md`, `skills.json`, `skills.toon`, README surfaces, setup prompt wording, graph artifacts, and survey artifacts.

## Rejected changes
- Adding a new persistent-completion or Codex-hook wrapper.
- Letting `ralph` absorb `omc`, `omx`, `ohmg`, `jeo`, or `ralphmode` responsibilities.
- Leaving local docs on the stale "Codex compensation-only" framing.

## Durable boundary note
If the user needs **spec-first clarification, immutable seed generation, drift-aware execution, or persistent completion until verification passes**, use `ralph`.
If the user instead needs **Claude-native runtime mechanics**, route to `omc`; **Codex-native runtime mechanics** to `omx`; **Gemini / Antigravity harness setup** to `ohmg`; **approval posture** to `ralphmode`; and **integrated delivery ledger / review flow** to `jeo`.

## Related pages
- [[core-orchestration-platform-cluster]]
- [[skill-support-coverage]]
- [[ralph-support-hardening-2026-04-16]]
- [[jeo-structural-hardening-2026-04-16]]
- [[skill-standardization-structural-hardening-2026-04-17]]
