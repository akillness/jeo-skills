# Platform Map: bmad packet ratchet

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Core BMAD phase/artifact selection | Best kept in vendor-neutral prompt/skill content | Best kept in vendor-neutral prompt/skill content | Best kept in vendor-neutral prompt/skill content | `bmad` owns level/phase/next-artifact routing |
| Runtime configuration | Claude Code settings, memory, hooks, approvals live in runtime layer | `AGENTS.md`, config.toml, approvals, sandbox, optional hooks live in runtime layer | `GEMINI.md` / harness projections / runtime config live in runtime layer | Route runtime config to `omc`, `omx`, `ohmg` |
| Context persistence | Strong assistant-native memory/hook story | Strong repo-local instructions/config story | Strong portable harness story | Keep BMAD artifact logic separate from runtime config |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Artifact approval gate | Easy to model with stop hooks and review callbacks | Easier through repo instructions / approval flow than hook-native phase gates | Better as harness policy plus generated guidance | `bmad` should name review-gate need, then route to `plannotator` or runtime overlay |
| Runtime-specific orchestration | `omc` owns Claude-first orchestration | `omx` owns Codex-first orchestration | `ohmg` owns Gemini / Antigravity harness orchestration | `bmad` should not absorb runtime-specific rules |
| Brownfield repo interpretation | Supported, but still needs explicit packet normalization | Supported, but rules/config can blur planning with runtime execution | Supported, but projection layer should stay distinct from core artifact logic | Core layer should normalize the packet before runtime-specific execution |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-planning normalization | Often hook-friendly | Often instruction/config-driven | Often harness/projection-driven | `bmad` should normalize packet type before choosing next artifact |
| Review / phase transition | Strong explicit callback/hook fit | More manual or config-mediated | Usually harness-mediated | Route review gates to `plannotator` / runtime layer |
| Execution handoff | Natural handoff into Claude-first runtime | Natural handoff into Codex-first runtime | Natural handoff into Gemini harness runtime | `bmad` should stop at handoff boundary |

## Platform Gaps
- Claude has the strongest native hook story for phase gates, but that should stay in `omc`, not in `bmad`.
- Codex and Gemini can express the same high-level BMAD routing, but the runtime mechanics differ enough that a shared core skill should stay artifact-first and vendor-neutral.
- Plain docs/checklists/status files remain the universal fallback when no runtime-specific automation is available.
- The clean abstraction is stable: `bmad` chooses the next artifact; `omc`, `omx`, and `ohmg` project that decision into runtime-specific settings, rules, and hooks.
