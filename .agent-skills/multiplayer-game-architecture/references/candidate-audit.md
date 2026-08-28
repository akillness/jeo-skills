# Candidate audit for the pictured game skills

Audit date: 2026-08-28

The screenshot contains names but no repository URLs. The table below records the strongest
public source match found by exact-name web search. It does not claim that every screenshot
card came from that exact repository. Direct source pages were preferred over marketplace
mirrors, and current pages were re-opened because search indexes can retain deleted paths.

| Pictured label | Strongest public source match | Disposition in jeo-skills |
|---|---|---|
| `higgsfield-game-generation` | [higgsfield-ai/skills at `fb18134`](https://github.com/higgsfield-ai/skills/tree/fb18134b4aabe99c4bf7ff01c8f4883400efc80d) | Retained only as a compatibility alias. The exact advertised folder is absent at the audited pin and `higgsfield-websites` owns `--type game`, so the local name now audits that drift and hands all operational work to the checked-in owner instead of duplicating its flow. |
| `game-engine` | [github/awesome-copilot](https://github.com/github/awesome-copilot/tree/main/skills/game-engine) | Broad Canvas/WebGL/Phaser/Three.js reference. Existing `web-game-development` plus the installed Three.js family already owns this lane. |
| `multiplayer-game` | [davila7/claude-code-templates multiplayer](https://github.com/davila7/claude-code-templates/tree/main/cli-tool/components/skills/creative-design/game-development/multiplayer) | Selected gap. The source is a compact principle sheet, but its generic topology table and fixed update-rate examples were not copied. This skill rebuilds the lane from engine, standards, and security sources. |
| `game-developer` | [VoltAgent game-developer agent](https://github.com/VoltAgent/awesome-claude-code-subagents/blob/main/categories/07-specialized-domains/game-developer.md) | A very broad persona covering engines, rendering, networking, monetization, and invented universal targets. It competes with many existing specialists and is not a focused portable skill. |
| `game-ui-design` | [omer-metin/skills-for-antigravity](https://github.com/omer-metin/skills-for-antigravity/tree/main/skills/game-ui-design) | Consolidated into the new canonical `game-ui-ux` contract rather than added as a duplicate visual-design skill. Branded identity claims were not treated as evidence. |
| `game-design-theory` | [custom-plugin-game-developer at `aa7edfe`](https://github.com/pluginagentmarketplace/custom-plugin-game-developer/blob/aa7edfe267b34eac63d888f60b13e08aca7850ed/skills/game-design-theory/SKILL.md) | Selected bounded analysis gap. The new skill chooses one lens, exposes limits and causal assumptions, requires a falsifier and controlled prototype, and routes full GDD/production outward. Universal heuristics were not copied. |
| `game-feel` | [awesome-gamedev-agent-skills at `7110607`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7110607ab816ece9669274bc84937857a8819796/skills/disciplines/game-feel/SKILL.md) | Selected focused gap. The new skill measures one mechanic's input-to-recovery response chain, changes one causal variable, separates simulation from presentation, and requires accessibility alternatives instead of copying numeric recipes. |
| `game-ui-ux` | [awesome-gamedev-agent-skills at `7110607`](https://github.com/gamedev-skills/awesome-gamedev-agent-skills/blob/7110607ab816ece9669274bc84937857a8819796/skills/disciplines/game-ui-ux/SKILL.md) | Selected canonical generic game-interface gap. It owns decisions, hierarchy, screen/focus flow, safe-area/reflow, localization, bindings, and verification while routing project-specific Open Design and engine implementation outward. |
| `threejs-game-ui-designer` | [majidmanzarpour/threejs-game-skills](https://github.com/majidmanzarpour/threejs-game-skills/tree/main/skills/threejs-game-ui-designer) | Consolidated into `game-ui-ux` for the generic contract and the existing Three.js family for implementation. A second Three.js UI planner would duplicate both owners. |
| `develop-web-game` | Former OpenAI skill mirrors and the current [OpenAI browser-game use case](https://developers.openai.com/codex/use-cases/browser-games) plus [OpenAI game-studio plugin](https://github.com/openai/plugins/tree/main/plugins/game-studio) | The old exact `openai/skills` path returned 404 during this audit. Current official guidance is plan-first browser iteration and the newer game-studio plugin. Local `web-game-development` and `wai-play` already cover this lane. |

## Selection result

Five non-competing catalog lanes were retained from the ten labels:

1. `multiplayer-game-architecture`: engine-neutral topology, authority, replication,
   transport, lifecycle, security, observability, and impairment contract;
2. `higgsfield-game-generation`: read-only compatibility alias for a documented name whose
   exact upstream folder is absent; it resolves and hands off to the checked-in owner;
3. `game-design-theory`: one-lens, falsifiable causal design analysis, not a full GDD;
4. `game-feel`: measured input-to-recovery tuning for one existing mechanic;
5. `game-ui-ux`: canonical generic game-interface contract consolidating three overlapping
   pictured names while preserving engine and project route-outs.

The other five labels remain covered by existing owners or are too broad to become a focused
portable skill: `game-engine`, `game-developer`, `threejs-game-ui-designer`, and
`develop-web-game`, plus the separate `game-ui-design` name now consolidated into
`game-ui-ux`.

No upstream skill text or code was copied into the new implementations. Candidate sources
were used as discovery inventories. Guidance was rebuilt from pinned upstream evidence,
primary sources, explicit non-claims, deterministic validators, and existing catalog
boundaries.
