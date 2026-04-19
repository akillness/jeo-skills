# Platform Map: plannotator structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Runtime config | `settings.json` / project settings | `config.toml` | `settings.json` | Use settings for enforced permissions, sandboxing, and review-policy defaults |
| Safe approval before edits | Strong via permissions + hooks | Possible via config/approval policy, but plan interception is still weaker in upstream `plannotator` | Strong via settings + hooks | `settings` own hard policy; the skill should not pretend rules alone enforce approval |
| Remote/browser handoff | Supported but still needs stable port choices in remote mode | Manual setup burden is more visible | Supported with hook-based setup | Treat fixed URL/port and remote-mode decisions as setup-state, not review content |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Repo instructions | `CLAUDE.md` plus project conventions | `AGENTS.md` plus project conventions | `GEMINI.md` plus project conventions | Rules should describe when to review a plan/diff/spec and when to route to neighboring skills |
| Review packet language | Clear plan-review and diff-review packet language fits well | Especially important because manual invocation is common | Clear packet language helps hook-driven plan review stay narrow | `rules` should classify the artifact first: plan, diff, markdown/spec, setup, or troubleshooting |
| Route-outs | `task-planning`, `ralph`, `code-review`, `agentation`, `obsidian`, `llm-wiki` | Same route-outs, with extra honesty about manual review paths | Same route-outs | Keep policy review, orchestration, and UI bug markup outside `plannotator` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Plan-review interception | Strong native story in upstream `plannotator` and runtime hooks | Hook platform exists publicly, but upstream `plannotator` still documents Codex as manual/diff-first | Strong hook story in upstream docs | `hooks` should be described as native where real, partial where experimental/manual |
| Diff / artifact review trigger | Easy to connect to review commands | Manual review command path is the practical default today | Hook or command path works | Always allow a manual targeted review path, even when hook support exists |
| Post-review automation | Good for approval/request-changes handoff | Partial/experimental depending on runtime integration | Good | Logging/export/notification belongs here, not in the front-door description |

## Platform Gaps
- **Claude:** richest current plan-review story, but the skill should still distinguish manual diff review from automatic plan interception.
- **Codex:** public hooks now exist, but upstream `plannotator` still documents manual review and users report setup confusion; the skill must be honest about this partial state.
- **Gemini:** strong fit for hook-driven plan review, but the skill should still keep setup details out of the front door.
- **OpenCode:** the major user complaint is not missing UI value but overly eager auto-invocation; manual-last-plan style review remains an important behavioral gap.
- **Common abstraction:** map review jobs into `settings` (hard gate), `rules` (when to review and route out), and `hooks` (automation around review), instead of describing each runtime as a totally separate product.
