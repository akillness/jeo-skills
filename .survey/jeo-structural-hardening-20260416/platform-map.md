# Platform Map: JEO structural hardening

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Primary config surface | `~/.claude/settings.json` hooks + MCP config | `~/.codex/config.toml` + hook/instruction string | `~/.gemini/GEMINI.md` + `~/.gemini/settings.json` AfterAgent hook | Platform bootstrap and config snippets belong in references, not in the core trigger surface |
| Runtime dependency | Claude teams / hook mode | Blocking CLI + notification hook | Blocking CLI + AfterAgent safety net | `jeo` should describe the decision path, then link out to per-platform setup |
| Persistent local memory | `.jeo/` ledger + `.omc/state/jeo-state.json` | same repo-local ledger/state | same repo-local ledger/state | Repo-local ledger/state is the durable common layer |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Plan gate | Hook-only `EnterPlanMode` → `ExitPlanMode` flow; do not call raw plannotator directly | Run blocking `plannotator-plan-loop.sh` | Run blocking `plannotator-plan-loop.sh` with Gemini docs/hook safety net | Never enter EXECUTE without plan approval |
| Runtime ownership | Claude-native orchestration belongs to `omc` | Codex-native runtime belongs to `omx` | Gemini/Antigravity runtime belongs to `ohmg` | `jeo` composes runtime anchors; it should not absorb their full behavior |
| Permission posture | `ralphmode` may support low-friction trusted setup | same | same | Rules about lowering friction belong to `ralphmode`, not `jeo` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Plan review trigger | `PermissionRequest` matcher `ExitPlanMode` calling `claude-plan-gate.py` | Blocking shell loop, same-turn feedback | Blocking shell loop plus AfterAgent safety net | Plan review is a mandatory hook/gate, regardless of runtime |
| UI submit trigger | `UserPromptSubmit` hook for agentation submit gate | explicit ready/submit handoff | explicit ready/submit handoff | Never process agentation drafts before explicit submit |
| Status / resume | repo-local state and `.jeo` ledger | repo-local state and `.jeo` ledger | repo-local state and `.jeo` ledger | Resume/checkpoint behavior belongs to shared state docs |

## Platform Gaps
- OpenCode is supported in JEO, but the current repo evidence for its plugin/runtime detail is thinner than the Claude/Codex/Gemini setup paths; `jeo` should keep OpenCode setup concise and route readers to reference docs rather than over-claim parity.
- The common abstraction is stable (`settings`, `rules`, `hooks`), but the exact config snippets change faster than the orchestration contract. That is why config-heavy material should live in `references/`.
