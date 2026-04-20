---
title: Core Orchestration Platform Cluster
created: 2026-04-15
updated: 2026-04-20
type: concept
tags: [skills, consolidation, trigger-design, graphify]
sources: [.survey/ohmg-modernization-20260415/context.md, .survey/ohmg-modernization-20260415/platform-map.md, .survey/ralph-support-hardening-20260416/context.md, .survey/ralph-support-hardening-20260416/platform-map.md, .survey/jeo-structural-hardening-20260416/context.md, .survey/jeo-structural-hardening-20260416/platform-map.md, .survey/survey-structural-hardening-20260418/context.md, .survey/survey-structural-hardening-20260418/platform-map.md, .survey/omc-structural-hardening-20260419/context.md, .survey/omc-structural-hardening-20260419/platform-map.md, .survey/jeo-structural-hardening-20260420/context.md, .survey/jeo-structural-hardening-20260420/platform-map.md, .survey/omc-packet-ratchet-20260420/context.md, .survey/omc-packet-ratchet-20260420/platform-map.md, graphify-out/GRAPH_REPORT.md]
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

The `ralph` support-hardening pass reinforced that same rule inside the core-orchestration lane: finishing eval coverage and removing stale self-path examples was more valuable than creating another persistent-loop wrapper.

The `ralph` structural-hardening pass pushed the next step further: once support coverage was complete, the best bounded move was shrinking the front door, correcting stale Codex compensation-only wording, and moving runtime ownership into references and sibling skills instead of letting the portable method surface absorb Claude / Codex / Gemini execution details.

The 2026-04-20 `jeo` structural-hardening follow-up extends the same pattern to the repo's front-door router: once support coverage is complete, the best bounded move is tightening `jeo` into a packet-first orchestration front door, keeping the shared ledger/phase contract central, and pushing runtime/browser specifics into references and sibling skills instead of re-expanding them inline.

The `omc` structural-hardening pass completed the first cleanup on the Claude-first runtime anchor: the stable contract became the plugin-vs-CLI split plus explicit route-outs. `omc` should explain when to use plugin setup, in-session slash skills, terminal CLI commands, or recovery/state guidance, but it should not flatten those surfaces into one giant command catalog or absorb `jeo`, `ralphmode`, browser-review, or non-Claude runtime ownership.

The 2026-04-20 `omc` install-topology ratchet pushed that boundary one step further: once the plugin-vs-CLI split was clear, the next durable ambiguity was **install topology**. The stable front door is now marketplace plugin vs shell CLI vs local `--plugin-dir` vs mixed/unknown overlap first, then packet routing second. That keeps duplicate-install, local-checkout, and setup-drift questions inside `omc` without turning the skill into another generic orchestration wrapper.

The `survey` structural-hardening pass extended that same rule to the research layer that sits just ahead of planning/orchestration work: keep the 4-lane `.survey/{slug}` contract, but move slower-changing Claude / Codex / Gemini portability detail into a focused reference so the front door stays portable without becoming another oversized orchestration manual.

## Related pages
- [[skill-support-coverage]]
- [[ohmg-modernization-2026-04-15]]
- [[ralph-support-hardening-2026-04-16]]
- [[jeo-structural-hardening-2026-04-16]]
- [[jeo-structural-hardening-2026-04-20]]
- [[omc-structural-hardening-2026-04-19]]
- [[omc-install-topology-ratchet-2026-04-20]]
- [[survey-structural-hardening-2026-04-18]]
- [[developer-workflow-cluster]]
