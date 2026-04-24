# zeude — Enterprise AI Adoption Platform for Claude Code

> Measure usage. Sync config. Guide teams. Turn AI investment into AI fluency.

← [Back to README](../../README.md)

---

## What `zeude` owns

`zeude` is the skill for [zep-us/zeude](https://github.com/zep-us/zeude), an enterprise platform that solves the **Intention-Action Gap** in Claude Code adoption. Organizations deploying Zeude achieve a **3× improvement in adoption rates** (6% → 18% in pilot deployments) through data-driven insights rather than mandates.

Use this skill when you need to:
- **Measure Claude Code adoption** across an engineering org via OpenTelemetry + ClickHouse
- **Centrally deploy** skills, MCP servers, and hooks to all developers from one dashboard
- **Deliver context-aware skill suggestions** at prompt time via UserPromptSubmit hooks
- **Identify power users** and surface their best practices to the rest of the team
- **Auto-sync configuration** on every `claude` invocation via the Zeude Shim

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add zep-us/zeude
```

### Self-hosted
```bash
git clone https://github.com/zep-us/zeude.git
cd zeude
cp .env.example .env
# Set SUPABASE_URL, SUPABASE_KEY, CLICKHOUSE_DSN in .env

cd zeude/dashboard && pnpm install && pnpm dev
```

### Per-developer Shim (using agent key from dashboard)
```bash
curl -fsSL https://raw.githubusercontent.com/zep-us/zeude/main/install.sh | bash -s -- --key <AGENT_KEY>
```

### Skill
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill zeude
```

---

## Requirements

| Dependency | Purpose |
|------------|---------|
| Claude Code | Target platform being managed |
| Supabase | Configuration storage and user management |
| ClickHouse | Analytics backend for session data |
| Go | Building the CLI shim |
| Node.js + pnpm | Dashboard frontend |
| macOS / Linux | x86_64 or arm64 |

---

## Architecture

```
Sensing   → OpenTelemetry traces → ClickHouse → Dashboard analytics
Delivery  → Dashboard API → Zeude Shim → Local ~/.claude/ configuration
Guidance  → User prompts → Hook analysis → Context-aware skill suggestions
```

### Sensing
Captures every Claude Code session automatically — no developer behavior change required.

### Delivery
The Zeude Shim intercepts `claude` commands, syncs centralized config (`skills/`, MCP servers, hooks), then passes control to the real Claude CLI.

### Guidance
2-tier keyword matching fires on every prompt via `UserPromptSubmit` hooks, surfacing relevant skills inline at the moment developers need them.

---

## Further reading

- [`.agent-skills/zeude/SKILL.md`](../../.agent-skills/zeude/SKILL.md)
- [zep-us/zeude](https://github.com/zep-us/zeude)
- Enterprise contact: jaegyu.lee@zep.us
