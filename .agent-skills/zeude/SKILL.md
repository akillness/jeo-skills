---
name: zeude
description: >
  Enterprise AI adoption platform for Claude Code — measures team usage via OpenTelemetry,
  syncs skills/MCP servers/hooks from a central dashboard, and delivers context-aware
  skill suggestions at prompt time. Solves the Intention-Action Gap: organizations that
  deploy Zeude see 3x adoption improvement (6% → 18%). Requires Supabase (config) and
  ClickHouse (analytics). Triggers on: zeude, ai adoption, claude code adoption,
  enterprise claude, opentelemetry claude, skill sync, team claude management.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: enterprise, ai-adoption, claude-code, opentelemetry, clickhouse, supabase, team-management, skill-sync, mcp-management, analytics
  platforms: Claude Code
  keyword: zeude
  version: latest
  source: zep-us/zeude
  license: Apache-2.0
---

# zeude — Enterprise AI Adoption Platform for Claude Code

> Measure usage. Sync config. Guide teams. Turn AI investment into AI fluency.

`zeude` is an enterprise platform that transforms organizations into AI natives by solving the **Intention-Action Gap** in Claude Code adoption. It provides centralized measurement, automated configuration sync, and context-aware skill guidance — delivering 3× improvement in adoption rates without mandating behavior.

## Installation

### Plugin (Claude Code)
```bash
claude plugin marketplace add zep-us/zeude
```

### Self-hosted (recommended for enterprise)
```bash
git clone https://github.com/zep-us/zeude.git
cd zeude
cp .env.example .env
# Configure Supabase and ClickHouse credentials in .env

# Start dashboard
cd zeude/dashboard && pnpm install && pnpm dev
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/jeo-skills --skill zeude
```

## Requirements

- Claude Code installed and authenticated
- **Supabase** account — configuration storage and user management
- **ClickHouse** instance — analytics backend
- macOS or Linux (x86_64 / arm64)
- Go (for building the CLI shim)
- Node.js + pnpm (for the dashboard)

## When to use

- Measure **Claude Code adoption rates** across an engineering org without mandating behavior
- **Centrally deploy** skills, MCP servers, and hooks to all developers in one push
- Surface **context-aware skill suggestions** at the moment a developer types a prompt
- Identify **power users** and surface their best practices to the rest of the team
- Run **OpenTelemetry traces** on Claude Code sessions for usage analytics in ClickHouse

## Do not use when

- You need a single-developer setup → use standard `skills add` directly
- You don't have Supabase + ClickHouse infrastructure → prerequisites block self-hosting
- You need a fully managed SaaS → contact enterprise sales at jaegyu.lee@zep.us

## Architecture: Three-Layer Ecosystem

```
Sensing   → OpenTelemetry traces → ClickHouse → Dashboard analytics
Delivery  → Dashboard API → Zeude Shim → Local ~/.claude/ configuration
Guidance  → User prompts → Hook analysis → Context-aware skill suggestions
```

### 1. Sensing — Measure adoption

Zeude captures every Claude Code session via OpenTelemetry without modifying developer behavior.

```bash
# Configure OTEL endpoint in .env
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
CLICKHOUSE_DSN=clickhouse://...
```

Dashboard shows:
- Adoption rates by team and individual
- Token usage patterns
- Most-used skills and prompts
- Power user identification

### 2. Delivery — Sync configuration

The **Zeude Shim** intercepts `claude` commands and syncs centralized config before passing control to the real Claude CLI.

```bash
# Per-developer install (using agent key from dashboard)
curl -fsSL https://raw.githubusercontent.com/zep-us/zeude/main/install.sh | bash -s -- --key <AGENT_KEY>
```

Config synced on every invocation:
- `~/.claude/skills/` — deployed skills
- MCP server configurations
- Hooks (UserPromptSubmit, etc.)

### 3. Guidance — Skill suggestions

Zeude uses 2-tier keyword matching to deliver relevant skill suggestions at prompt time via `UserPromptSubmit` hooks.

```bash
# Hook fires on every Claude prompt
# Zeude analyzes intent → suggests relevant skills inline
```

## Dashboard API

```bash
# Start dashboard (after .env configuration)
cd dashboard && pnpm dev

# Available endpoints (via dashboard)
GET  /api/skills          # list deployed skills
POST /api/skills          # deploy a skill to all team members
GET  /api/analytics       # adoption metrics
POST /api/teams           # create/manage teams
```

## Operating rules

1. Set up Supabase and ClickHouse **before** any developer installs the Shim
2. Deploy the dashboard and verify API health before distributing agent keys
3. Use the Zeude Shim installer (not manual symlinks) so auto-update works
4. Monitor the ClickHouse dashboard weekly to identify adoption gaps
5. Push new skills centrally from the dashboard rather than asking developers to install manually
6. Keep agent keys per-team for access control granularity

## References

- [zep-us/zeude](https://github.com/zep-us/zeude)
- [Docs](../../docs/zeude/README.md)
- Enterprise contact: jaegyu.lee@zep.us

Source: [zep-us/zeude](https://github.com/zep-us/zeude) — Apache-2.0 License
