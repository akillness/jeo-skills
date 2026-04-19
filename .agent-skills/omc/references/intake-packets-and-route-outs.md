# OMC intake packets and route-outs

Use this file when the front door has already identified that the user wants OMC, but you need the smallest truthful next step.

## 1. Packet selector

| Packet | Use when | Start with | Escalate to |
|---|---|---|---|
| `plugin-setup` | The user needs plugin install, first-run setup, or setup repair | Plugin install + `setup omc` / `/oh-my-claudecode:omc-setup` | `cli-reference.md` for plugin-dir / shell-side install details |
| `in-session-runtime` | The user is inside Claude Code and needs a slash-skill recommendation | `/team`, `/autopilot`, `/ralph`, `/ultrawork`, or `/deep-interview` | `modes-reference.md` for mode nuances |
| `terminal-runtime` | The user wants shell-side `omc` commands or tmux teams | `omc setup`, `omc update`, `omc ask`, `omc team` | `cli-reference.md` |
| `recovery-and-update` | Something is broken, duplicated, stale, or resume/state behavior is wrong | Verify surface → rerun truthful setup/update path → inspect env/state/plugin-dir | `hooks-reference.md`, `cli-reference.md` |
| `boundary-and-route-out` | The user really needs an adjacent skill, not OMC depth | Route to the correct owner | skill listed below |

## 2. Surface truth table

| Question | Prefer | Why |
|---|---|---|
| “I’m inside Claude Code and want multiple agents to work together” | `/team ...` | Native in-session team workflow |
| “I want tmux workers from my shell” | `omc team ...` | CLI runtime, not in-session team mode |
| “I want OMC to set itself up / repair itself” | `setup omc` or `/oh-my-claudecode:omc-setup` if already in Claude Code; `omc setup` if explicitly on the shell CLI | Setup entrypoint depends on the surface |
| “I want Autopilot / Ralph / Ultrawork” | in-session `/autopilot`, `/ralph`, `/ultrawork` (or natural-language equivalents) | These are plugin/in-session skills, not normal CLI subcommands |
| “I want provider consultation from the shell” | `omc ask <provider> ...` | CLI-side advisor flow |

## 3. Recovery checklist

### Duplicate install or command confusion
- Check whether the plugin, CLI, and local-checkout/plugin-dir surfaces were all installed
- If plugin-dir or local checkout is involved, use the documented plugin-dir flags / `OMC_PLUGIN_ROOT` path instead of inventing cleanup steps
- Re-run the current setup/update flow from the truthful surface

### Team mode fails or silently downgrades
- Verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`
- Confirm the user is actually using `/team` in Claude Code rather than `omc team` from the shell
- If tmux shell workers are the real goal, switch to the CLI explanation directly

### Resume / state / worktree weirdness
- Inspect `.omc/state/` and team/session naming
- Consider worktree namespace collisions before blaming the mode choice
- Treat worktree/plugin-dir/state layout as the problem, not “OMC team mode” in the abstract

### HUD / rate-limit / ephemeral-environment trouble
- Call out environment volatility explicitly
- Treat this as runtime recovery, not a reason to recommend a different orchestration mode
- Prefer documented update/recovery/status paths over ad hoc hook surgery

## 4. Route-outs

| If the real job is... | Route to |
|---|---|
| Resumable plan → execute → verify ledger across multiple skills | `jeo` |
| Spec-first persistence method and keep-going-until-verified workflow | `ralph` |
| Approval posture, trusted-folder / bypass policy, permission surface | `ralphmode` |
| Plan approval / diff review gate | `plannotator` |
| Fresh-session website verification | `agent-browser` |
| Reusing an authenticated running browser | `playwriter` |
| Exact rendered UI annotation / critique handoff | `agentation` |
| Codex-first orchestration runtime | `omx` |
| Gemini / Antigravity portable harness adoption | `ohmg` |

## 5. Stable phrasing to reuse

- “`/team` and `omc team` are both real, but they are different runtimes.”
- “Start from the surface you are actually using: Claude Code slash skill vs shell-side `omc` CLI.”
- “Use OMC for Claude-first runtime orchestration; route long-loop planning, approval posture, browser review, or other vendor runtimes outward.”
- “The package name is `oh-my-claude-sisyphus`, while the runtime command is `omc`.”
