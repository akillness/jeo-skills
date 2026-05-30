# OMC intake packets and route-outs

Use this reference after the front door has already identified the operator's install topology.

## 1. Packet selector

| Packet | Use when | Primary response shape | Deep reference |
|---|---|---|---|
| `install-topology` | The user needs install/setup guidance, topology cleanup, or local-checkout / plugin-dir help | Name the topology first, then give only the matching setup flow | `install-topology-and-recovery.md` |
| `in-session-runtime` | The user is already inside Claude Code and wants the best slash skill | Pick the smallest truthful slash skill and note nearby alternatives only if needed | `modes-reference.md` |
| `terminal-runtime` | The user wants shell-side `omc` commands or tmux workers | Recommend the matching `omc ...` command family | `cli-reference.md` |
| `recovery-and-update` | Something is broken, duplicated, stale, or resume/state behavior is wrong | Verify topology → verify surface → rerun truthful setup/update path → inspect env/state | `install-topology-and-recovery.md`, `hooks-reference.md`, `cli-reference.md` |
| `boundary-and-route-out` | The user really needs an adjacent skill, not OMC depth | Route to the correct owner | skill listed below |

## 2. Surface truth table

| User phrasing | Prefer | Why |
|---|---|---|
| "I want multiple agents inside Claude Code" | `/team` | Native in-session team runtime |
| "I want tmux workers / shell-side team mode" | `omc team` | Terminal runtime |
| "I want OMC to set itself up / repair itself" | `setup omc` or `/oh-my-claudecode:omc-setup` if already in Claude Code; `omc setup` if explicitly on the shell CLI | Setup entrypoint depends on the surface |
| "I want Claude to keep going until it's actually done" | `/ralph ...` | In-session persistence skill |
| "I need Codex / Gemini on the shell as helpers" | `omc ask <provider> ...` or `omc team <N>:<provider> ...` | Shell-side provider access |

## 3. Recovery checklist

### Duplicate install or command confusion
- Check whether the marketplace plugin, CLI, and local-checkout/plugin-dir surfaces were all installed.
- If plugin-dir or local checkout is involved, use the documented plugin-dir / `OMC_PLUGIN_ROOT` path instead of inventing cleanup steps.
- Re-run the current setup/update flow from the truthful topology.

### Team mode fails or silently downgrades
- Verify `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.
- Confirm whether the user really wanted `/team` or `omc team`.
- Treat hook/HUD or environment breakage as recovery, not as proof that another mode is correct.

### Resume / state / worktree weirdness
- Inspect `.omc/state/`, team/session naming, and worktree layout.
- Treat worktree/plugin-dir/state layout as the problem, not "OMC team mode" in the abstract.

### HUD / rate-limit / ephemeral-environment trouble
- Prefer documented update/recovery/status paths over ad hoc hook surgery.
- Separate environment failures from mode-selection questions.

## 4. Route-outs

| If the real job is... | Route to |
|---|---|
| Long-lived plan → execute → verify ledger | `jeo` |
| Spec-first persistence beyond OMC runtime detail | `ralph` |
| Approval posture, trusted-folder / bypass policy, permission surface | `ralphmode` |
| Plan approval / review gate | `plannotator` |
| Fresh-session browser verification | `browser-harness` |
| Running authenticated browser reuse | `playwriter` |
| Exact rendered-UI critique / annotation handoff | `agentation` |
| Codex-first runtime orchestration | `omx` |
| Gemini / Antigravity portable harness | `ohmg` |

## 5. Stable phrasing to reuse

- "Start from the topology and surface you are actually using: marketplace plugin, shell-side `omc` CLI, or local `--plugin-dir` workflow."
- "Use OMC for Claude-first runtime orchestration; route long-loop planning, approval posture, browser review, or other vendor runtimes outward."
- "Treat duplicate installs and plugin-dir drift as recovery problems before suggesting more commands."