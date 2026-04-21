# Platform Map: omc structural hardening

## Settings
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Runtime install surface | Claude Code plugin plus optional `omc` CLI runtime (`oh-my-claude-sisyphus`) | `oh-my-codex` runtime on top of Codex CLI | `oh-my-agent` / `oma` with `.agents/` as source of truth | Install/runtime choice belongs in `settings` because users must know which host and generated surface they are operating inside |
| Agent/team enablement | `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, plugin registration, hooks/HUD setup | tmux runtime, prompt/skill install, `.omx/` state | Gemini-native generated agents or portable `.agents/` / Antigravity fallback | Runtime prerequisites and provider-specific knobs map cleanly to `settings` |
| State location | `.omc/state/`, plugin-dir and worktree namespace behavior | `.omx/` ledger/runtime folders | `.agents/` plus generated vendor views | Persistent state shape is a runtime setting concern |
| Cross-model add-ons | Optional Codex/Gemini CLIs for `omc ask` / CCG | Optional Claude/Gemini consultation | Portable harness can later project to Claude/Codex | Provider-extension choices map to `settings` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| When to use the platform skill | Claude-first in-session orchestration, plugin/hooks/HUD/team runtime questions | Codex-first orchestration and tmux worker flows | Gemini / Antigravity portable-harness adoption | Runtime ownership and route-outs are `rules` |
| What not to absorb | Do not swallow `jeo` ledger flow, browser review, permission posture, or non-Claude vendor runtimes | Do not absorb Claude/Gemini-native runtime questions | Do not copy full Claude/Codex runtime catalogs into portable harness docs | Boundary enforcement is `rules` |
| Truthful command framing | Distinguish plugin slash skills from `omc` shell commands; do not imply a single surface | Distinguish Codex prompts from `omx` runtime commands | Distinguish Gemini-native generated agents from `oma` fallback spawning | “Tell the operator the real entrypoint” is a shared rule |
| Escalation / route-outs | Route spec-first persistence to `ralph`, long-loop orchestration to `jeo`, approval/browser/UI review to specialist skills | Route cross-platform policy to `ralphmode`, plan review to `plannotator`, browser/UI review outward | Route Claude-first or Codex-first runtime asks outward to `omc` / `omx` | Route-outs are rule-layer decisions |

## Hooks
| Lifecycle | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|-----------|---------------|-------------|---------------|--------------|
| Prompt-time behavior | OMC injects slash skills and magic-keyword behavior inside Claude Code | OMX exposes prompt/workflow triggers inside Codex CLI | OHMG primarily teaches generated-agent / `oma` workflow surfaces | Prompt-time activation maps to `hooks` |
| Session persistence | Hooks/HUD/update flows preserve `.omc` state and inject reminders | OMX runtime/ledger persists in `.omx/` and tmux sessions | Portable harness persists through `.agents/` and generated files | Persistence automation maps to `hooks` when runtime-managed |
| Error / recovery | Setup/doctor/update and resume/state hygiene are recurring operator hooks | Doctor/check/runtime recovery and team shutdown/resume | `oma doctor` / relink / regenerate vendor views | Recovery callbacks and lifecycle repair map to `hooks` |
| Notifications / external callbacks | `omc wait`, stop callbacks, HUD | tmux/runtime status and operator commands | dashboard / dashboard:web / spawn-parallel CLI | Operator notifications are hook-like lifecycle helpers |

## Platform Gaps
- OMC currently has the noisiest plugin-vs-CLI ambiguity, so its front door benefits most from routing-first wording.
- OMX and OHMG already present clearer runtime identities in this repo; OMC is the lagging dense/manual surface.
- Not every upstream OMC doc agrees on plugin-only vs plugin+CLI support, so the repo skill should avoid overcommitting to one stale phrasing and instead route users to the exact surface they need.
- OMC’s hook/HUD/state details change faster than the stable boundary with `jeo`, `ralph`, `plannotator`, `agent-browser`, `agentation`, and `ralphmode`; the skill should keep that stable boundary front-and-center and push volatile operational detail into references.
