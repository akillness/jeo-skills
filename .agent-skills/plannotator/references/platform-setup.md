# Platform setup

Use this reference when the main job is connecting `plannotator` to a specific runtime or explaining the current platform reality honestly.

## Universal first step
```bash
bash scripts/install.sh
bash scripts/check-status.sh
```

If the CLI is not installed or status is unclear, start there.

## Platform support summary

| Platform | Current honest story | Best first move |
|---|---|---|
| Claude Code | Strongest native/hook-driven plan-review fit | install CLI, configure Claude hook/plugin path, restart, verify with a real plan |
| Gemini CLI | Strong hook-driven fit for plan review and review commands | install CLI, configure Gemini hook path, verify with `/plan` and a real artifact |
| Codex CLI | Manual/partial review story is still the safest documented default in upstream `plannotator`; diff and markdown review are easier than full plan interception | install CLI, run status, configure Codex support, and explain any remaining manual-review limitations honestly |
| OpenCode | Good plugin/event story, but user feedback shows auto-invocation can feel too eager | install CLI, configure plugin, verify manual and plan-review behavior, and keep manual control visible |

## Claude Code

### Best fit
- strongest plan-gating flow when plan mode / exit-plan hooks are available
- best default when the user wants approval before execution

### Setup path
```bash
bash scripts/setup-hook.sh
```

If you are using the upstream plugin path, use the current plugin/hook instructions and then restart Claude Code.

Verification:
- `bash scripts/check-status.sh`
- trigger a real plan-review flow
- confirm the browser review opens at the right checkpoint

## Gemini CLI

### Best fit
- strong hook-driven plan review and review-command story
- good fit when the user already works in `/plan`

### Setup path
```bash
bash scripts/setup-gemini-hook.sh
```

Verification:
- `bash scripts/check-status.sh`
- trigger plan mode or the relevant review command
- confirm the browser review opens with the expected artifact

## Codex CLI

### Current reality
- upstream docs still frame Codex as the place for **manual diff review, markdown annotation, and partial setup**, not full native plan-review parity
- public Codex hooks exist, but the `plannotator` skill should not over-promise support the upstream docs do not currently claim

### Setup path
```bash
bash scripts/setup-codex-hook.sh
bash scripts/check-status.sh
```

Verification:
- confirm the CLI is installed
- confirm the Codex-side integration files exist
- test a manual review path on a real diff or markdown artifact
- if the user wants plan interception parity, label it as a current gap or partial path rather than a guaranteed feature

## OpenCode

### Current reality
- plugin/event integration is available
- user feedback shows that auto-invocation can be annoying when the wrong agent triggers review

### Setup path
```bash
bash scripts/setup-opencode-plugin.sh
bash scripts/check-status.sh
```

Verification:
- confirm plugin registration
- restart OpenCode
- test whether the desired review flow is manual, plan-triggered, or both
- keep a manual "review this artifact now" path visible when auto-review is too eager

## Remote / devcontainer / WSL setups
```bash
bash scripts/configure-remote.sh
bash scripts/check-status.sh
```

Use remote mode when the review server runs in a container, SSH session, WSL environment, or another remote shell where browser opening and port stability need extra handling.

## Verification checklist
- `plannotator` CLI is installed
- the runtime-specific integration is in place
- `bash scripts/check-status.sh` reports the expected integration
- a real plan, diff, PR, or markdown artifact can trigger the intended review path
- remote mode and stable URL/port behavior are verified when applicable

## When setup is the wrong problem
If the real issue is:
- machine provisioning / runtimes / devcontainers → `system-environment-setup`
- execution orchestration or task ledgers → `jeo`, `vibe-kanban`, `bmad`
- platform-level runtime ownership → `omc`, `omx`, `ohmg`
- note-system management beyond save integration → `obsidian`, `llm-wiki`
