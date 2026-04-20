# Platform Map: omc packet ratchet

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Primary config store | Layered Claude settings plus plugin setup; OMC also depends on `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | `~/.codex/config.toml` plus MCP / approval config; OMX adds `.omx/` runtime conventions | Layered Gemini settings JSON plus `.agents/`-driven harness patterns in OHMG | runtime settings |
| Runtime emphasis | Native in-session teams, subagents, hooks | CLI / config / MCP substrate, wrapper supplies more workflow behavior | Settings + policy + portable harness | runtime settings |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Persistent instruction surface | `CLAUDE.md`, permissions, project memory | `AGENTS.md`, execution policy | `GEMINI.md`, `.agents/`, policy files | rules |
| Wrapper role | OMC is Claude-first, not portable-first | OMX is Codex-first and uses workflow conventions more than native rules folders | OHMG keeps `.agents/` canonical, then projects into vendor-native surfaces | rules |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Native hook support | Strong first-class hook surface and plugin hooks | Thin notify-style hook surface; wrapper behavior should not be mislabeled as native hooks | Strong first-class lifecycle hooks and policy integration | hooks |
| OMC implication | Claude-native hooks/HUD/plugin behavior are part of the real OMC surface | OMX runtime helpers are mostly wrapper behavior | OHMG can rely on stronger portable hook/policy mapping | hooks |

## Platform Gaps
- Claude / OMC has the best native in-session orchestration, but also the biggest operator hazard: plugin/in-session runtime and shell CLI runtime are both real and must not be flattened.
- Codex / OMX has stronger CLI/config/MCP foundations than hook parity; wrapper runtime behavior needs honest labeling.
- Gemini / OHMG has strong settings/rules/hooks portability, but wrapper implementations are fragmented and not a reason to pretend OMC is portable-first.
- The clean abstraction is: `settings` for runtime behavior, `rules` for persistent instruction/policy, and `hooks` for lifecycle automation. `omc` should stay anchored to the Claude/OMC surface while routing other runtime ownership outward.

## Sources
- https://docs.anthropic.com/en/docs/claude-code/settings
- https://docs.anthropic.com/en/docs/claude-code/hooks
- https://developers.openai.com/codex/cli
- https://github.com/openai/codex/blob/main/docs/config.md
- https://geminicli.com/docs/reference/configuration/
- https://geminicli.com/docs/reference/policy-engine/
- https://github.com/Yeachan-Heo/oh-my-claudecode
- https://github.com/Yeachan-Heo/oh-my-codex
- https://github.com/first-fluke/oh-my-agent/blob/main/README.md
