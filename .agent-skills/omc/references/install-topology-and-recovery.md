# OMC install topology and recovery

Use this reference when the front door has already identified that the real job is install topology, local checkout / plugin-dir behavior, or mixed-surface recovery.

## 1. Topology truth table

| Topology | What is actually installed | Use when | Preferred next step |
|---|---|---|---|
| `marketplace-plugin` | Claude Code plugin / slash-skill surface | The operator wants `/team`, `/autopilot`, `/ralph`, hooks, HUD, or normal in-session setup | `/plugin marketplace add ...` → `/plugin install oh-my-claudecode` → `setup omc` or `/oh-my-claudecode:omc-setup` |
| `shell-cli` | npm package `oh-my-claude-sisyphus` providing the `omc` command | The operator wants shell-side `omc setup`, `omc update`, `omc ask`, or `omc team` | `npm i -g oh-my-claude-sisyphus@latest` |
| `local-plugin-dir` | Local checkout used through `--plugin-dir` / `OMC_PLUGIN_ROOT` | The operator is testing or developing a checkout and wants changes reflected without marketplace cache confusion | `omc --plugin-dir <path> ...` plus `omc setup --plugin-dir-mode` |
| `mixed-or-unknown` | Overlapping plugin + CLI + local checkout or unclear state | Duplicate slash skills, duplicate commands, stale HUD/hooks, or unclear ownership | Stop adding installs; inspect the active surfaces first |

## 2. Marketplace plugin path

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

Use this path for ordinary Claude Code operators who mainly want in-session skills.

## 3. Shell CLI path

Install the shell runtime separately when the operator truly wants `omc` commands:

```bash
npm i -g oh-my-claude-sisyphus@latest
```

Remember:
- the package name is `oh-my-claude-sisyphus`
- the runtime command is `omc`
- `/team` and `omc team` are not the same thing

## 4. Local checkout / plugin-dir path

Use this when the operator is modifying OMC locally or needs to avoid marketplace cache lag.

Key truths:
- `--plugin-dir` alone is session-scoped unless the operator also wires the persistent root correctly
- `OMC_PLUGIN_ROOT` matters when the operator wants the shell runtime to resolve the local checkout consistently
- `omc setup --plugin-dir-mode` is the truthful setup path for this topology

Typical pattern:

```bash
omc --plugin-dir /path/to/oh-my-claudecode setup --plugin-dir-mode
```

What this solves:
- local edits not showing up because the marketplace copy is still active
- duplicate or stale plugin cache behavior
- confusion between "I changed the checkout" and "Claude is still reading the old cached plugin"

## 5. Mixed-or-unknown recovery checklist

If commands or slash skills appear twice, or setup state is unclear:

1. Check whether the marketplace plugin, npm CLI, and local-checkout/plugin-dir flow were all used.
2. Decide which topology should be canonical for this machine / repo.
3. Re-run the truthful setup/update flow for that topology.
4. Only then continue with runtime-mode guidance.

Useful recovery questions:
- Are duplicate commands coming from plugin install + `omc setup` overlap?
- Is the operator on a local checkout but still invoking a marketplace-cached copy?
- Is the shell `omc` command coming from the expected install location?
- Is the worktree/state issue actually a topology mismatch rather than a mode-selection problem?

## 6. Team, HUD, and state prerequisites

Native Claude teams require:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

Additional recovery reminders:
- worktree / `.omc/state/` layout problems are runtime-state issues, not proof that `/team` is the wrong mode
- HUD or rate-limit failures are recovery/environment topics first
- prefer documented setup/update/doctor flows over ad hoc hook surgery

## 7. Route-outs

If the operator is no longer really asking about OMC topology or runtime ownership:

| Real need | Route to |
|---|---|
| Long-lived plan → execute → verify ledger | `jeo` |
| Spec-first persistence / keep-going method | `ralph` |
| Permission surface / bypass policy | `ralphmode` |
| Codex-first runtime | `omx` |
| Gemini / Antigravity portable harness | `ohmg` |
| Fresh-session browser verification | `browser-harness` |
| Running browser reuse | `playwriter` |
| Exact rendered-UI annotation | `agentation` |
