# Platform setup

Use this reference when the user needs plannotator installed or integrated with a specific agent platform.

## Universal first step
```bash
bash scripts/install.sh
bash scripts/check-status.sh
```

If the CLI is not installed or status is unclear, start there.

## Claude Code

### Best fit
- strongest plan-gating flow when plan mode / ExitPlanMode is available
- good default when the user wants approval before execution

### Setup paths
```bash
# hook-based setup
bash scripts/setup-hook.sh

# optional install helper
bash scripts/install.sh --with-plugin
```

Use the plugin/hook path recommended by the current upstream installation flow.
After setup, restart Claude Code.

## Gemini CLI
```bash
bash scripts/setup-gemini-hook.sh
```

Typical flow:
- work in plan/approval mode
- let the configured hook hand off into plannotator review

## Codex CLI
```bash
bash scripts/setup-codex-hook.sh
```

Typical flow:
- install the helper prompt/config integration
- use the documented prompt/manual review path for plan submission

## OpenCode
```bash
bash scripts/setup-opencode-plugin.sh
```

Typical flow:
- register the plugin
- restart OpenCode
- use the available slash commands for review/annotation

## Remote / devcontainer / WSL setups
```bash
bash scripts/configure-remote.sh
bash scripts/check-status.sh
```

Use remote mode when the review server runs in a container, SSH session, WSL environment, or another remote shell where browser opening/ports need extra handling.

## Verification checklist
- `plannotator` CLI is installed
- the platform-specific hook/plugin/prompt integration is in place
- `bash scripts/check-status.sh` reports the expected integration
- a real plan or diff can trigger the review UI

## When setup is the wrong problem
If the real issue is:
- machine provisioning / runtimes / devcontainers → `system-environment-setup`
- execution orchestration or task ledgers → `jeo`, `vibe-kanban`
- note-system management beyond save integration → `obsidian`, `llm-wiki`
