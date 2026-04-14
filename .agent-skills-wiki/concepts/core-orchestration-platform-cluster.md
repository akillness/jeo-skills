---
title: Core Orchestration Platform Cluster
created: 2026-04-15
updated: 2026-04-15
type: concept
tags: [skills, consolidation, trigger-design, graphify]
sources: [.survey/ohmg-modernization-20260415/context.md, .survey/ohmg-modernization-20260415/platform-map.md, graphify-out/GRAPH_REPORT.md]
---

# Core Orchestration Platform Cluster

## Durable finding
The platform-orchestration lane is cleaner when `ohmg`, `omc`, and `omx` are treated as **different runtime anchors**, not three equivalent "multi-agent framework" wrappers.

## Current cluster shape
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
- If the main question is **portable `.agents` structure, Gemini-native generated agents, or Antigravity compatibility** → `ohmg`
- If the main question is **Claude Code-native orchestration, plugin flow, or `/team` / `/autopilot` behavior** → `omc`
- If the main question is **Codex-native orchestration, `$deep-interview` / `$ralplan` / `$team` / `$ralph` behavior, or `.omx/` state** → `omx`
- If the main question is **permission posture or approval reduction around automation** → `ralphmode`
- If the main question is **multi-skill composition across planning / browser / execution helpers** → `jeo`

## Structural note
The `ohmg` modernization pass confirmed the same pattern seen elsewhere in the repo: fixing a stale high-visibility anchor and adding support files is more valuable than creating another overlapping platform wrapper.

## Related pages
- [[skill-support-coverage]]
- [[ohmg-modernization-2026-04-15]]
- [[developer-workflow-cluster]]
