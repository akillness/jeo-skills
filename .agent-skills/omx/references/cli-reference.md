# OMX CLI Reference (v0.11.10)

---

## Installation

```bash
npm install -g @openai/codex oh-my-codex
omx setup
omx doctor
```

**Requirements:**
- Node.js 20+
- Codex CLI configured with OpenAI auth
- tmux (macOS/Linux) or psmux (Windows) for team mode

---

## Core Launch

```bash
omx                       # Launch Codex with OMX runtime
omx --madmax --high       # Recommended default
omx --madmax --xhigh      # Extra-high reasoning
omx --yolo                # Fast, minimal verification
omx --dry-run             # Preview without execution
omx --verbose             # Verbose output
```

### Launch Flags

| Flag | Maps to | Description |
|------|---------|-------------|
| `--madmax` | `--dangerously-bypass-approvals-and-sandbox` | Bypass Codex approval prompts |
| `--high` | `--reasoning high` | High reasoning effort |
| `--xhigh` | `--reasoning xhigh` | Extra-high reasoning effort |
| `--yolo` | fast mode | Minimal verification, fast execution |
| `--dry-run` | preview | Show what would run without executing |
| `--verbose` | debug output | Show detailed execution info |

---

## Setup & Diagnostics

```bash
omx setup               # Install prompts, skills, AGENTS scaffolding, config
omx setup --scope local # Project-scoped setup only
omx doctor              # Verify full installation
omx doctor --team       # Verify team mode dependencies
omx status              # Show active modes and state
omx cancel              # Cancel active execution modes
omx reasoning <level>   # Set: low/medium/high/xhigh
omx --version           # Show installed version
omx help                # Show help and available commands
```

---

## Team Runtime

```bash
# Start N workers of a role
omx team 3:executor "fix all TypeScript errors"
omx team 2:security-reviewer,1:architect "audit auth module"

# Worker roles: any /prompts:* agent name
# executor, architect, planner, debugger, verifier, security-reviewer, etc.

# Session management
omx team status <session-name>   # Check workers
omx team resume <session-name>   # Resume paused session
omx team shutdown <session-name> # Stop all workers
```

**Platform requirements:**

| Platform | Dependency | Install |
|----------|-----------|---------|
| macOS | tmux | `brew install tmux` |
| Ubuntu/Debian | tmux | `sudo apt install tmux` |
| Fedora | tmux | `sudo dnf install tmux` |
| Arch | tmux | `sudo pacman -S tmux` |
| Windows (native) | psmux | `winget install psmux` |
| Windows (WSL2) | tmux | `sudo apt install tmux` |

---

## Explore & Inspect

```bash
# Read-only repository exploration
omx explore --prompt "find where team state is written"
omx explore --prompt "show all API endpoints"

# Bounded shell inspection
omx sparkshell git status
omx sparkshell npm test
omx sparkshell --tmux-pane %12 --tail-lines 400

# omx explore is Rust-native — safe, read-only
# omx sparkshell is bounded — cannot escape sandbox
```

---

## HUD (Status Monitor)

```bash
omx hud                 # Show HUD options
omx hud --watch         # Live status monitor
```

---

## Notifications (OpenClaw)

```bash
# Configure notifications via OpenClaw gateway
$configure-notifications    # Inside Codex

# Or via CLI
omx configure-notifications
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OMX_BYPASS_DEFAULT_SYSTEM_PROMPT` | `1` | Set to `0` to disable AGENTS.md injection |
| `OMX_MODEL_INSTRUCTIONS_FILE` | `<cwd>/AGENTS.md` | Path to custom instructions file |
| `OMX_HOOK_PLUGINS` | `0` | Set to `1` to enable hook plugins |

---

## Hooks System

```bash
# Enable hook plugins
OMX_HOOK_PLUGINS=1 omx hooks test

# Hook commands
omx hooks init      # Initialize hooks
omx hooks status    # Check hook status
omx hooks validate  # Validate configuration
omx hooks test      # Test hook execution
```

Plugin files: `.omx/hooks/*.mjs`

**Native lifecycle events:**
- `session-start` / `session-end` / `session-idle`
- `turn-complete`
