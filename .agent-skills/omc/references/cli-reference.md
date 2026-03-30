# OMC CLI Reference

Full syntax for all `omc` CLI commands.

---

## omc team — tmux Worker Sessions

```bash
omc team <N>:<provider> "<task>"
```

Launch N workers of the given provider type in a tmux session:

```bash
omc team 2:codex "review auth module for security"
omc team 3:gemini "redesign UI components for consistency"
omc team 1:claude "implement payment processing flow"
omc team 2:claude,1:gemini "full-stack feature with design review"
```

**Session management:**
```bash
omc team status <session-name>   # Check running workers
omc team shutdown <session-name> # Stop all workers in session
omc team list                    # List all active sessions
```

Requires: `tmux` installed

---

## omc ask — Provider Advisor

Query a specific AI provider for consultation:

```bash
omc ask claude "review this migration plan"
omc ask codex --prompt "identify architecture risks in auth.ts"
omc ask gemini --prompt "propose UI polish ideas for the dashboard"
```

**Flags:**
- `--prompt <text>`: Provide prompt text (alternative to positional arg)
- `--context <file>`: Include file as context
- `--output <file>`: Save response to file

---

## omc wait — Rate Limit Auto-Resume

Automatically resume Claude Code sessions after rate limit resets:

```bash
omc wait              # Check current rate limit status
omc wait --start      # Enable background auto-resume daemon
omc wait --stop       # Disable auto-resume daemon
omc wait --status     # Check daemon status
```

Requires: `tmux` installed

---

## omc config-stop-callback — Notifications

Configure notifications when Claude Code stops/completes:

```bash
# Telegram
omc config-stop-callback telegram \
  --enable \
  --token <bot_token> \
  --chat <chat_id>

# Discord
omc config-stop-callback discord \
  --enable \
  --webhook <webhook_url> \
  --tag-list "@here,<@USER_ID>"

# Slack
omc config-stop-callback slack \
  --enable \
  --webhook <webhook_url>

# Disable any provider
omc config-stop-callback telegram --disable
```

---

## Slash Commands (Inside Claude Code)

| Command | Action |
|---------|--------|
| `/oh-my-claudecode:omc-setup` | Run initial setup wizard |
| `/oh-my-claudecode:omc-setup --local` | Project-scoped setup |
| `/oh-my-claudecode:omc-doctor` | Diagnose installation |
| `/oh-my-claudecode:team N:executor "task"` | Start team pipeline |
| `/oh-my-claudecode:autopilot` | Start autopilot skill |
| `/oh-my-claudecode:ralph` | Start ralph persistence |
| `/oh-my-claudecode:ultrawork` | Start ultrawork mode |
| `/oh-my-claudecode:ccg` | Start CCG 3-model synthesis |
| `/oh-my-claudecode:ralplan` | Consensus planning |
| `/oh-my-claudecode:deep-interview` | Socratic requirements |
| `/oh-my-claudecode:hud setup` | Configure status bar HUD |
| `/oh-my-claudecode:learner` | Extract skills from sessions |
| `/oh-my-claudecode:cancel` | Cancel active execution mode |

---

## Settings Reference (`~/.claude/settings.json`)

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "omcHud": {
    "preset": "focused"
  },
  "codeSimplifier": {
    "enabled": false,
    "extensions": [".ts", ".tsx", ".js", ".jsx", ".py"],
    "maxFiles": 10
  }
}
```

**HUD presets:** `focused` | `minimal` | `detailed` | `off`

---

## Installation

```bash
# Via Claude Code marketplace (recommended)
/plugin marketplace add https://github.com/Yeachan-Heo/oh-my-claudecode
/plugin install oh-my-claudecode

# Via npm (note: package name differs from repo)
npm install -g oh-my-claude-sisyphus

# Update
/plugin marketplace update omc
/oh-my-claudecode:omc-setup
```

**Requirements:**
- Claude Code CLI
- Node.js 20.0.0+
- tmux (macOS: `brew install tmux` | Ubuntu: `apt install tmux`)
- Optional: Codex CLI, Gemini CLI
