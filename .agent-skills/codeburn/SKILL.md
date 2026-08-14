---
name: codeburn
description: >
  Drive CodeBurn, a free open-source local-first CLI/TUI/web/menubar tool that
  reads the session files already on disk from 40 AI coding tools (Claude
  Code, Codex, Cursor, Gemini CLI, Grok, OpenCode, and more) and breaks down
  token usage and dollar cost by task, model, tool, and project. Use when the
  user wants to see where their AI coding spend went, find and fix token
  waste in a Claude Code / agent setup, cap a session's budget before it runs
  away, compare which model is actually worth its price, check whether AI
  spend shipped or was reverted, or wire live usage/savings data into an
  agent over MCP. Triggers on: "codeburn", "npx codeburn", "AI token usage",
  "AI coding cost", "where did my Claude spend go", "codeburn optimize",
  "codeburn guard", "codeburn compare models", "codeburn yield", "token
  waste in CLAUDE.md", "AI spend dashboard".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Node.js 22.13+. Run instantly with `npx codeburn` (no install needed), or
  `npm install -g codeburn` / `bunx codeburn` / `pnpm dlx codeburn` /
  `brew install codeburn` (macOS) for a permanent command. Cursor and
  OpenCode auto-install `better-sqlite3`. Requires at least one supported
  tool with session data already on disk. Everything runs locally — no
  wrapper, no proxy, no API keys, nothing leaves the machine. MIT license.
metadata:
  tags: codeburn, ai-cost-tracking, token-usage, claude-code, codex, cursor, observability, cost-optimization, cli, mcp, tui, guard-hooks
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/getagentseal/codeburn
---

# CodeBurn — see where your AI coding spend goes

CodeBurn is a free, open-source, local-first tool that tracks AI coding token
usage and cost across 40 tools and agents (Claude Code, Cursor, Codex, Gemini,
Grok, OpenCode, and more), broken down by model, project, and task. It reads
the session files those tools already write to disk — no wrapper, no proxy,
no API keys — and prices every call from LiteLLM's daily-refreshed pricing
data. Four surfaces (terminal TUI, browser dashboard, macOS menu bar / GNOME
panel, and an MCP server) all read the same on-disk source of truth.

## When to use this skill

- Getting a quick answer to "where did my AI budget go this week/month?"
  (`codeburn`, `codeburn overview`, `codeburn report`)
- Finding concrete token/dollar waste in a Claude Code setup — re-read files,
  bloated `CLAUDE.md`, unused MCP servers, ghost agents/skills — and applying
  the fix (`codeburn optimize`, `codeburn optimize --apply`)
- Capping runaway session spend before it happens, or flagging projects with
  known waste at session start (`codeburn guard install`)
- Deciding which model is actually worth its price for a given kind of work
  (`codeburn compare`)
- Checking whether AI-assisted work actually shipped, or was reverted /
  abandoned (`codeburn yield`)
- Exposing live usage/savings data to an agent mid-conversation
  (`codeburn mcp`)
- Diagnosing why a tool shows $0 or no data (`codeburn doctor`)

## When not to use this skill

- The user wants to change how much a model *costs* per call (pricing
  policy, rate limits) — CodeBurn only measures and reports spend, it does
  not set prices or throttle API calls itself (guard's caps stop a session,
  they don't change billing)
- The user wants cloud/team-wide spend analytics with a hosted backend as the
  primary need — CodeBurn's `sync` feature is a preview push-to-your-own-URL
  telemetry channel, not a hosted SaaS dashboard
- The task is about the AI tools' own behavior/config unrelated to cost
  (e.g., writing a new Claude Code skill, debugging an MCP server's logic)
  and no spend/waste/token question is actually in play

## Instructions

### Step 1: Run it instantly, no install

```bash
npx codeburn                 # opens the interactive TUI dashboard, last 7 days
```

For a permanent command: `npm install -g codeburn` (or `bunx`/`pnpm dlx`/
`brew install codeburn` on macOS). Requires Node.js 22.13+.

### Step 2: Get the month at a glance, as text you can paste

```bash
codeburn overview                                    # this month, clean tables
codeburn overview --no-color                         # plain text for a PR/Slack/tweet
codeburn overview -p all                              # last 6 months
codeburn overview -p lifetime                         # full history
codeburn overview --provider claude                   # one tool only
codeburn status                                        # compact one-liner: today + month
codeburn report --format json                          # full dashboard data as JSON
```

Most commands accept `--provider`, `--project`/`--exclude`, and a period flag
(`-p today|week|30days|month|all|lifetime`) or `--from`/`--to`.

### Step 3: Find waste before fixing anything

```bash
codeburn optimize                       # scan the last 30 days
codeburn optimize -p week               # scope to the last 7 days
codeburn optimize --format json         # setup health + findings as JSON
```

Scans sessions and the `~/.claude/` setup for re-read files, low Read:Edit
ratio, uncapped bash output, unused MCP servers, ghost agents/skills, bloated
`CLAUDE.md`, and low-value expensive sessions. Each finding carries an
estimated token/dollar saving, a ready-to-paste fix, and an urgency ranking
rolled into an A–F setup-health grade.

### Step 4: Apply fixes safely, and be able to undo them

```bash
codeburn optimize --apply --dry-run   # print the plan, change nothing — do this first
codeburn optimize --apply --yes       # apply every appliable fix without prompting
codeburn act list                     # every change CodeBurn has made
codeburn act undo --last              # roll the most recent change back
codeburn act report                   # realized vs estimated savings, 3+ days later
```

Every applied change is backed up and journaled before it lands; always
preview with `--dry-run` before `--apply --yes` in an automated flow.

### Step 5: Guard the budget going forward

```bash
codeburn guard install            # hooks into this project's .claude/settings.json
codeburn guard install --global   # or into ~/.claude/settings.json
codeburn guard status             # caps, install locations, flagged projects
codeburn guard allow              # lift the hard cap for the current session only
```

Soft cap (default $5) warns once; hard cap (default $15) stops the session;
a checkpoint nudge fires on sessions that end with no edits/commits past a
threshold. Caps live in `~/.config/codeburn/guard.json`; hooks fail open and
never block a session on their own error.

### Step 6: Compare models and verify spend shipped

```bash
codeburn compare --provider claude      # one-shot rate, retries, cost/edit, cache hit
codeburn yield -p 30days --format json  # productive vs reverted/abandoned spend
```

`yield` correlates sessions with git commits by timestamp and requires being
run from a git repository.

### Step 7: Wire usage/savings into an agent (MCP)

```bash
claude mcp add codeburn -- npx -y codeburn mcp
```

Exposes `get_usage` (fast breakdowns by tool/model/project/task) and
`get_savings` (waste findings, retry tax, routing waste) over stdio, reading
the same local data as the CLI. Project names are pseudonymized unless the
caller asks with `include_project_names: true`.

### Step 8: Diagnose a tool showing $0 or no data

```bash
codeburn doctor                     # every provider, human-readable
codeburn doctor --provider opencode # diagnose one provider
codeburn doctor --json              # machine-readable
```

Fully offline and read-only: shows the exact paths probed (with any env
override such as `CLAUDE_CONFIG_DIR`/`CODEX_HOME`), how many sessions parsed,
and a one-line verdict per provider.

## Best practices

1. **Always `--dry-run` before `--apply --yes`** — `codeburn optimize
   --apply` writes to real config files; preview the plan first, especially
   in a non-interactive/automated flow.
2. **Run `codeburn doctor` before trusting a zero** — a $0/empty report
   usually means a path/env-var mismatch, not zero spend; `doctor` is
   read-only and safe to run anytime.
3. **`codeburn act undo` before hand-editing** — undo refuses (unless
   `--force`) if the target file changed since the fix was applied, which is
   the signal to inspect manually rather than force it.
4. **Guard caps are soft by default** — the hard cap ($15 default) is what
   actually stops a session; confirm both `guard status` caps before relying
   on it for a hard budget limit.
5. **`yield` needs a git repo** — run it from the project directory, not a
   scratch/temp directory, or attribution will be empty.
6. **Prefer `--format json` for scripting** — `report`, `today`, `month`,
   `status`, `optimize`, `export -f json`, and `yield` all support structured
   JSON output; don't scrape the colored TUI/table output.
7. **`sync` is preview** — treat `codeburn sync` (team telemetry push) as an
   evolving protocol, not a stable integration surface, when scripting
   against it.

## References

- [references/commands.md](references/commands.md) — curated command reference by workflow stage
- [CodeBurn GitHub Repository](https://github.com/getagentseal/codeburn)
- [Supported providers](https://github.com/getagentseal/codeburn/tree/main/docs/providers) — per-tool data location and quirks
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Find and fix waste in a Claude Code setup this week

```bash
codeburn optimize -p week
codeburn optimize --apply --dry-run
codeburn optimize --apply --yes
codeburn act report
```

### Example 2: Cap a runaway session and check what shipped

```bash
codeburn guard install --statusline
# ...work happens...
codeburn yield -p 30days
```
