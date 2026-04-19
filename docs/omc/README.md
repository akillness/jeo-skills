# omc — oh-my-claudecode Guide

> **OMC / oh-my-claudecode** is the Claude-first orchestration layer in this repo.
> The first job is choosing the right surface: **Claude Code slash skills** vs the **`omc` shell CLI**.

← [Back to README](../../README.md)

---

## 1. Two real surfaces

| Surface | Use when | Real entrypoints |
|---|---|---|
| **Claude Code plugin / in-session** | You are already inside Claude Code and want native team mode, Autopilot, Ralph, Ultrawork, hooks, or HUD behavior | `setup omc`, `/oh-my-claudecode:omc-setup`, `/team`, `/autopilot`, `/ralph`, `/ultrawork` |
| **Terminal CLI** | You want shell-side setup, updates, provider consultation, or tmux workers | `omc setup`, `omc update`, `omc ask`, `omc team` |

Important:
- `/team` and `omc team` are both real, but they are **different runtimes**
- `/autopilot`, `/ralph`, and `/ultrawork` are **in-session skills**, not ordinary `omc` CLI subcommands
- The npm package name is **`oh-my-claude-sisyphus`**, while the runtime command is `omc`

---

## 2. Install / setup

### Plugin-first path (recommended for Claude Code users)

Inside Claude Code:

```bash
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode
```

Then run one setup entrypoint:

```text
setup omc
```

or:

```text
/oh-my-claudecode:omc-setup
```

### Optional CLI install

If you also want `omc setup`, `omc update`, `omc ask`, or `omc team` from the shell:

```bash
npm i -g oh-my-claude-sisyphus@latest
```

### Native teams setting

Enable Claude Code native teams in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

---

## 3. Choose the right mode

| Need | Use |
|---|---|
| Shared Claude Code multi-agent execution | `/team 3:executor "task"` |
| End-to-end build from a vague ask | `/autopilot "task"` or `autopilot: task` |
| Keep going until verified complete | `/ralph "task"` or `ralph: task` |
| Burst parallel work | `/ultrawork "task"` or `ulw task` |
| Clarify requirements first | `/deep-interview "topic"` |
| Shell-side tmux workers | `omc team 2:codex "task"` |
| Shell-side provider consultation | `omc ask codex "task"` |

---

## 4. Recovery quick checks

Use these when OMC feels broken instead of switching modes blindly:

- Re-run the truthful setup/update path for the surface you are using
- Check `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` when native team mode is expected
- Inspect plugin-dir / local-checkout overlap if duplicate commands or files appear
- Treat worktree/state collisions as runtime/state issues, not as a reason to abandon Team mode
- Treat HUD/rate-limit issues as environment/recovery problems, especially in ephemeral environments

---

## 5. Route-outs

Do **not** force OMC when another skill owns the job better:

| If the real job is... | Route to |
|---|---|
| Long-lived plan → execute → verify ledger | `jeo` |
| Spec-first persistence method | `ralph` |
| Approval posture / trust / bypass policy | `ralphmode` |
| Plan approval / review gate | `plannotator` |
| Fresh-session browser verification | `agent-browser` |
| Running authenticated browser reuse | `playwriter` |
| Exact rendered-UI critique / annotations | `agentation` |
| Codex-first orchestration | `omx` |
| Gemini / Antigravity portable harness | `ohmg` |

---

## Quick Reference

| Action | Command |
|---|---|
| Plugin install | `/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode` |
| Plugin setup | `setup omc` or `/oh-my-claudecode:omc-setup` |
| Optional CLI install | `npm i -g oh-my-claude-sisyphus@latest` |
| Native team mode | `/team N:executor "task"` |
| Autopilot | `/autopilot "task"` |
| Ralph | `/ralph "task"` |
| Shell-side team runtime | `omc team N:provider "task"` |
| Shell-side provider ask | `omc ask <provider> "task"` |
| Update | `omc update` |
| Full docs | [oh-my-claudecode upstream](https://github.com/Yeachan-Heo/oh-my-claudecode) |
