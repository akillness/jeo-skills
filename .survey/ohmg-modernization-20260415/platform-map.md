# Platform Map: ohmg modernization

## Settings
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Primary runtime identity | Claude Code plugin / CLI overlay | Codex CLI workflow overlay | `oh-my-agent` projected into Gemini CLI / Antigravity | Choose the current runtime first, then map the portable harness into it |
| Source-of-truth files | OMC-managed plugin/setup files plus repo guidance | `.omx/` runtime state plus `AGENTS.md` guidance | `.agents/` as upstream source of truth; generated `.gemini/agents/*.md` for native use | Prefer one project-local canonical source, then generate or adapt vendor views |
| Install / bootstrap | `/plugin install` + `/setup` or `omc setup` | `npm install -g @openai/codex oh-my-codex` + `omx setup` | `curl .../install.sh | bash`, `bunx oh-my-agent@latest`, or global `oma` install/link | Installation should surface exact runtime bootstrap, not vague marketing language |
| Model / provider routing | OMC routes work across Claude / Codex / Gemini with Claude-first orchestration | OMX keeps Codex as execution engine, adds cross-model consultation | `oh-my-agent` prefers same-vendor native dispatch; cross-vendor work falls back to `oma agent:spawn` | Same-vendor native path first, cross-vendor fallback second |
| Persistent state | OMC tracks runtime state/HUD across workflows | `.omx/` stores plans, logs, memory, mode tracking | `.agents/` plus optional `.serena/memories/` and generated vendor surfaces | Separate durable project structure from runtime/transient status |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When to use the platform skill | Claude-first orchestration, plugin/native team workflows, in-session magic keywords | Codex-first orchestration, `$deep-interview/$ralplan/$team/$ralph` workflows | Gemini CLI or Antigravity users who want a portable multi-agent harness and cross-vendor-ready `.agents` structure | Platform skill should own the runtime-specific adoption path, not every adjacent workflow |
| Boundary with other platform skills | Route Codex-first or portable harness questions away from OMC when Claude-native runtime is not the goal | Route Claude-first or Gemini/Antigravity harness questions away from OMX when Codex-native runtime is not the goal | Route Claude-native runtime questions to `omc`, Codex-native runtime questions to `omx`; do not duplicate their mode catalogs | One platform anchor per runtime lane, with explicit handoffs |
| Safety / capability constraints | Respect Claude-native team availability and plugin/runtime differences | Respect Codex CLI runtime limits, team runtime optionality, and plan-first flow | State clearly that Antigravity can ingest `.agents/agents/` but does not support custom subagent spawning | Document platform limitations directly instead of flattening them away |
| Approval / workflow posture | OMC emphasizes autopilot/team/ralph orchestration inside Claude | OMX emphasizes clarify → approve plan → execute | OHMG should emphasize install/link → `.agents` SSOT → native Gemini use when possible → fallback spawn when needed | Explain the operating sequence, not just commands |

## Hooks
| Lifecycle | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|-----------|---------------|-------------|---------------|--------------|
| Setup hook | `/setup`, `/omc-setup`, `omc setup` | `omx setup` | interactive `oma` installer / `oma link` / optional bridge setup | Setup should create the runtime-specific files that project from the canonical source |
| Pre-execution routing | Magic keywords and in-session skill detection | `$deep-interview`, `$ralplan`, role prompts | choose native Gemini generated agents first when vendor matches | Normalize routing: detect runtime, then dispatch to native or fallback path |
| Cross-vendor execution | `omc team`, `/ccg`, provider ask flows | `$ask-claude`, `$ask-gemini`, tmux teams | `oma agent:spawn` / `oma agent:parallel` when leaving native Gemini path | Cross-vendor orchestration should be explicit and observable |
| Monitoring / post-run | HUD, callbacks, team status | HUD/status/runtime state in `.omx/` | dashboard over `.serena/memories/`, optional web dashboard | Monitoring belongs in helper/runtime layers, not in the core mental model |

## Platform Gaps
- `ohmg` currently behaves like a legacy one-vendor framework wrapper, but upstream `oh-my-agent` is now portable-first; the skill needs to encode that shift.
- Antigravity does not align cleanly with Gemini CLI for custom subagent spawning, so `ohmg` must describe a hybrid capability model rather than pretending both surfaces are equivalent.
- OMC and OMX have richer vendor-specific execution taxonomies than OHMG should replicate. The clean abstraction is: **settings = runtime/bootstrap**, **rules = when this platform skill owns the task**, **hooks = how setup/dispatch/fallback/monitoring work**.
