# Solution Landscape: ohmg modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| oh-my-agent | Portable `.agents` source-of-truth harness with vendor-native projection plus fallback CLI spawn | Cross-vendor portability, generated native agent surfaces, project-local skills/workflows, active upstream maintenance | More setup complexity than a single vendor-native runtime; Antigravity still has capability gaps | Best upstream anchor for `ohmg` |
| Gemini CLI native surface | Native Gemini terminal agent with skills, MCP/extensions, and Gemini-specific guidance | Direct platform fit, native tools, native agent surfaces | Does not by itself explain portable cross-vendor harnessing | `ohmg` should target this surface first |
| OMC / oh-my-claudecode | Claude-first multi-agent runtime/plugin with team, autopilot, and runtime helpers | Strong Claude-native workflow language, plugin UX, deep mode catalog | Claude-specific and high overlap if copied into `ohmg` | `ohmg` should route Claude-first runtime questions here |
| OMX / oh-my-codex | Codex-first workflow layer with canonical skills and runtime state | Strong Codex-native workflow language and orchestration patterns | Codex-specific and high overlap if copied into `ohmg` | `ohmg` should route Codex-first runtime questions here |
| Portable `.agents`-style packaging | Project-local agent/skill/workflow layout that can be projected into vendor-native surfaces | Transferable mental model and repo portability | Requires clearer install/link/execution guidance than one-vendor runtimes | A good conceptual frame for `ohmg` |

## Categories
- **Portable harness / source of truth**: `oh-my-agent`, `.agents` packaging
- **Vendor-native base surfaces**: Gemini CLI, Claude Code, Codex CLI
- **Vendor-first orchestration overlays**: `omc`, `omx`
- **Cross-vendor dispatch layer**: `oh-my-agent` native-first + `oma agent:spawn` fallback
- **Observability/runtime helpers**: dashboard, HUD, local runtime state

## What People Actually Use
In practice, upstream tells users to install `oh-my-agent` / `oma`, work from `.agents/`, let the current vendor use native agent files when possible, and fall back to `oma agent:spawn` when crossing runtimes. Dashboards exist, but they are a monitoring/helper surface rather than the main workflow abstraction.

## Frequency Ranking
1. Native instruction/agent surfaces (`GEMINI.md`, `AGENTS.md`, plugin/agent folders)
2. Workflow overlays on top of native CLIs (`omc`, `omx`, `oh-my-agent` workflows)
3. Extensibility layers (MCP, hooks, plugins)
4. Observability/runtime-state helpers (dashboard, HUD, tracked state)
5. Portable `.agents` harnesses (less common, but the key differentiator for `ohmg`)

## Key Gaps
- The local `ohmg` skill still describes an old product surface and misses the `.agents` / `oma` source-of-truth model.
- Gemini CLI and Antigravity are still presented too symmetrically; the Antigravity custom-subagent gap needs to be explicit.
- The skill lacks support files and evals, so there is no durable guardrail against drifting back into OMC/OMX duplication.

## Contradictions
- Marketed/legacy local framing says “Ultimate multi-agent framework for Google Antigravity” with Serena memory at the center; upstream current framing says portable multi-agent harness across Antigravity, Claude Code, Codex, Gemini CLI, Cursor, OpenCode, and more.
- Local skill centers manual spawn/dashboard snippets; upstream current docs center `.agents` as source of truth, native vendor projection, and portable workflow reuse.

## Key Insight
The right move is not to create another orchestration skill. It is to modernize `ohmg` into the **Gemini / Antigravity-facing entrypoint for `oh-my-agent`**, with explicit route-outs to `omc` and `omx`. That preserves one clear skill per platform/runtime lane while giving Gemini users the modern portable-harness mental model that the current skill is missing.

## Curated Sources
- https://github.com/first-fluke/oh-my-agent
- https://github.com/first-fluke/oh-my-agent/blob/main/README.md
- https://github.com/first-fluke/oh-my-agent/blob/main/docs/SUPPORTED_AGENTS.md
- https://github.com/Yeachan-Heo/oh-my-claudecode
- https://github.com/Yeachan-Heo/oh-my-codex
- local `.agent-skills/ohmg/SKILL.md`
- local `.agent-skills/omc/SKILL.md`
- local `.agent-skills/omx/SKILL.md`
