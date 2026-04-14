# OHMG Installation and Layout

## Current upstream identity
- Product / repo: **`oh-my-agent`**
- Common CLI name: **`oma`**
- Canonical upstream repo: https://github.com/first-fluke/oh-my-agent

## Install paths

### Interactive install
```bash
curl -fsSL https://raw.githubusercontent.com/first-fluke/oh-my-agent/main/cli/install.sh | bash
# or
bunx oh-my-agent@latest
# or
bun install --global oh-my-agent
```

Then run the interactive flow and choose the preset that matches the project.

### Verification
```bash
oma doctor
oma link
```

## Canonical directory model

`oh-my-agent` is designed around **`.agents/` as the source of truth**.

Typical layout:

```text
.agents/
├── agents/
├── skills/
├── workflows/
└── oma-config.yaml
```

Generated vendor views come from that canonical structure:

```text
.gemini/agents/*.md
.claude/agents/*.md
.codex/agents/*.toml
```

Use this rule:
- edit the canonical `.agents/` content
- regenerate vendor-facing files with `oma link`
- avoid maintaining separate per-runtime copies by hand

## Useful commands
```bash
oma doctor
oma link
oma dashboard
oma dashboard:web
oma agent:spawn backend "Build auth API" session-01
oma agent:parallel -i backend:"Auth API" frontend:"Login form"
```

## Common drift fixes
1. Wrong product name in local docs (`oh-my-ag` instead of `oh-my-agent`)
2. Legacy `.agent/` paths instead of `.agents/`
3. Generated Gemini/Claude/Codex files not refreshed after edits
4. Assuming the dashboard replaces the orchestration model instead of monitoring it
