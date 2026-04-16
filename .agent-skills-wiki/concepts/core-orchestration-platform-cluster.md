---
title: Core Orchestration Platform Cluster
created: 2026-04-15
updated: 2026-04-16
type: concept
tags: [skills, consolidation, trigger-design, graphify]
sources: [.survey/ohmg-modernization-20260415/context.md, .survey/ohmg-modernization-20260415/platform-map.md, .survey/ralph-support-hardening-20260416/context.md, .survey/ralph-support-hardening-20260416/platform-map.md, .survey/jeo-structural-hardening-20260416/context.md, .survey/jeo-structural-hardening-20260416/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Core Orchestration Platform Cluster

## Durable finding
The platform-orchestration lane is cleaner when `ohmg`, `omc`, and `omx` are treated as **different runtime anchors**, not three equivalent "multi-agent framework" wrappers.

## Current cluster shape
- `ralph` = canonical specification-first method and persistent completion loop: interview → immutable seed → execute → evaluate → evolve, plus `ooo ralph` for verified persistence
- `ohmg` = Gemini CLI / Antigravity-facing entry for the portable `oh-my-agent` harness, with `.agents` as the source of truth and cross-vendor-ready projection
- `omc` = Claude-first runtime overlay for plugin/in-session orchestration, team flows, and Claude-native operator surfaces
- `omx` = Codex-first runtime overlay for `$deep-interview`, `$ralplan`, `$team`, `$ralph`, and `.omx/` runtime-state behavior
- `ralphmode` = permission/profile layer that can support orchestration loops but should not replace the runtime anchor itself
- `jeo` = higher-level integrated orchestration that can compose platform skills, but should not flatten their boundaries

## Why it matters
- Trigger precision improves when Gemini/Antigravity harness adoption is not collapsed into Claude-first or Codex-first runtime catalogs.
- Repo users need a clear answer for "which platform orchestration skill owns this task?" before layering planning, approval, or workflow-review helpers on top.
- The graph refresh shows that discovery docs are high-degree nodes, so small wording mistakes in this cluster can distort activation across many sessions.

## Boundary rules
- If the main question is **spec-first clarification, immutable seed generation, drift/evaluate flows, or persistent completion until verification passes** → `ralph`
- If the main question is **portable `.agents` structure, Gemini-native generated agents, or Antigravity compatibility** → `ohmg`
- If the main question is **Claude Code-native orchestration, plugin flow, or `/team` / `/autopilot` behavior** → `omc`
- If the main question is **Codex-native orchestration, `$deep-interview` / `$ralplan` / `$team` / `$ralph` behavior, or `.omx/` state** → `omx`
- If the main question is **permission posture or approval reduction around automation** → `ralphmode`
- If the main question is **multi-skill composition across planning / browser / execution helpers** → `jeo`

## Structural note
The `ohmg` modernization pass confirmed the same pattern seen elsewhere in the repo: fixing a stale high-visibility anchor and adding support files is more valuable than creating another overlapping platform wrapper.

The `ralph` support-hardening pass reinforces that same rule inside the core-orchestration lane: finishing eval coverage and removing stale self-path examples is more valuable than creating another persistent-loop wrapper.

The `jeo` structural-hardening pass extends the same pattern to the repo's front-door router: once support coverage is complete, the best bounded move is shrinking the trigger surface, pushing config/state/troubleshooting detail into references, and preserving clean route-outs to the specialist runtime and review skills.

## Related pages
- [[skill-support-coverage]]
- [[ohmg-modernization-2026-04-15]]
- [[ralph-support-hardening-2026-04-16]]
- [[jeo-structural-hardening-2026-04-16]]
- [[developer-workflow-cluster]]
