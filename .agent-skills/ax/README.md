# ax Skill

**Version 1.0.0** — The AI-era curl for AI agents

> Fetch web pages, discover their structure, and extract structured data — without the curl → regex → parse loop.

## What is ax?

**ax** is a CLI tool designed specifically for AI agents to fetch, understand, and extract data from web pages deterministically and token-efficiently.

```bash
# Discover page structure
ax https://example.com --outline

# Extract structured rows
ax https://example.com '.item' --row 'title=h2, price=.cost' --json

# Markdown extraction
ax https://docs.example.com --md --budget 500
```

## Key Features

| Feature | Benefit |
| --- | --- |
| **Fetch with context** | Returns full response (status, headers, body), never silent |
| **Discover structure** | `--outline` shows page layout without raw HTML |
| **Extract rows** | Multi-field extraction with CSS selectors, 1 command |
| **Token budgeting** | Results capped by token count for LLM context |
| **Safe filtering** | `--where` filters at source (not regex) |
| **Parse caching** | HTML cached ~2 min for free probes |

## Quick Start

### Install ax

```bash
# Official installer (recommended)
curl -fsSL https://ax.yusuke.run/install | sh

# Or Homebrew
brew install yusukebe/tap/ax

# Or npm
npm install -g ax-cli

# Verify
ax --version
```

### Try It

```bash
# Discover any page
ax https://news.ycombinator.com --outline

# Extract data
ax https://github.com/yusukebe/ax --locate "Installation"

# Help
ax --help
ax agent-context
```

## When to Use ax

✅ **Use ax when:**
- Agent needs to fetch web pages and extract data
- You want discovery (`--outline`) before extraction
- Extracting multi-field rows (products, articles, etc.)
- You need token-efficient output
- Building repeatable scraping workflows
- Replacing `curl | jq | awk` chains

❌ **Don't use ax when:**
- Content requires JavaScript rendering (use Playwright)
- You need multi-step browser interactions
- Behind auth that requires real browser (use API instead)

## Integration with Agent Skills

| Skill | Use Case |
| --- | --- |
| `deep-agents-core` | Register ax as custom tool for agent tasks |
| `research` | Parallelize ax calls across multiple sites |
| `react-grab` | Combine ax discovery with React component capture |
| `react-best-practices` | Optimize token budget for LLM context |

## Project Files

- **SKILL.md** (13.5 KB) — Comprehensive guide, patterns, best practices
- **references/**
  - `installation.md` — System/project setup, troubleshooting
  - `cli-flags.md` — Complete flag reference
  - `agent-patterns.md` — Real-world agent workflows
- **scripts/**
  - `setup.sh` — Install & verify ax on your system
  - `scaffold-integration.sh` — Generate agent project skeleton (Python/Node/Bash)
- **README.md** — This file

## Common Tasks

### Task: Extract article headlines

```bash
ax https://news.example.com 'article' \
  --row 'title=h2, link=a@href, date=.posted' \
  --json
```

### Task: Find a section

```bash
ax https://docs.example.com --locate 'Installation'
```

### Task: Get docs as markdown

```bash
ax https://guide.example.com --md --budget 1500
```

### Task: Monitor API endpoint

```bash
ax https://api.example.com/status --no-cache --body | jq '.status'
```

## Real-World Cost Savings

| Task | Without ax | With ax | Savings |
| --- | --- | --- | --- |
| Multi-page markup drift | $0.458 | $0.150 | −67% |
| 60-item catalog | $0.296 (24s) | $0.104 (14s) | −65% |
| Live website (decoys) | $0.248 | $0.191 | −23% |

See full benchmarks in [ax GitHub](https://github.com/yusukebe/ax/blob/main/bench/RESULTS.md).

## Routing Brief

Use this when invoking ax from an agent task:

> **ax** — fetch, discover, extract web data without headless browser. Start with `ax <url> --outline` for free structure discovery. Then `ax <url> 'selector' --row` for extraction. Token budget & safe filtering built-in. For multi-page orchestration, route to `research` skill. For JS-rendered content, route to `Playwright`.

## Documentation

- [SKILL.md](./SKILL.md) — Full reference (concepts, patterns, best practices)
- [references/installation.md](./references/installation.md) — Setup guide
- [references/cli-flags.md](./references/cli-flags.md) — All flags detailed
- [references/agent-patterns.md](./references/agent-patterns.md) — Agent workflows
- Official: https://ax.yusuke.run
- Repository: https://github.com/yusukebe/ax

## Scripts

### setup.sh — Install & Verify

```bash
# Interactive setup
./scripts/setup.sh

# System-wide install
./scripts/setup.sh --system

# Project-local install
./scripts/setup.sh --project

# Verify
./scripts/setup.sh --verify
```

### scaffold-integration.sh — Generate Agent Project

```bash
# Create Python agent project
./scripts/scaffold-integration.sh my-agent --python

# Create Node.js agent project
./scripts/scaffold-integration.sh my-agent --node

# Create Bash agent project
./scripts/scaffold-integration.sh my-agent --bash

cd my-agent && cat README.md
```

Scaffolded projects include:
- Example scripts in your language
- Wrapper tools (Python class, Node async, Bash functions)
- Configuration files
- Integration examples

## Examples

### Python Agent

```python
from tools.ax_tool import AxTool

ax = AxTool()

# Discover
structure = ax.discover("https://example.com")

# Extract
data = ax.extract(
    url="https://example.com",
    selector=".item",
    fields={"title": "h2", "link": "a@href"}
)

# Markdown
docs = ax.markdown("https://docs.example.com")
```

### Node.js Agent

```javascript
const { AxTool } = require("./tools/ax-tool");

const ax = new AxTool();

// Discover
const structure = await ax.discover("https://example.com");

// Extract
const data = await ax.extract("https://example.com", ".item", {
  fields: { title: "h2", link: "a@href" }
});

// Markdown
const docs = await ax.markdown("https://docs.example.com");
```

### Bash Agent

```bash
#!/bin/bash
source scripts/ax-wrapper.sh

# Discover
ax-wrapper discover https://example.com

# Extract
ax-wrapper extract https://example.com '.item' --json

# Monitor
ax-wrapper monitor https://api.example.com 60
```

## Troubleshooting

**Q: "ax is not installed"**  
A: Run `curl -fsSL https://ax.yusuke.run/install | sh`

**Q: "Selector found 0 matches"**  
A: Run `ax <url> --outline` to see the actual structure

**Q: "Empty results" (after outline looks good)**  
A: Content may be JS-rendered. Try `--fresh`, or use Playwright instead.

**Q: "Truncated to N rows"**  
A: Results exceeded token budget. Increase `--budget` or filter with `--where`.

See [references/installation.md](./references/installation.md) for more troubleshooting.

## Next Steps

1. **Install:** `curl -fsSL https://ax.yusuke.run/install | sh`
2. **Explore:** `ax --help` and `ax agent-context`
3. **Read:** [SKILL.md](./SKILL.md) for full guide
4. **Scaffold:** `./scripts/scaffold-integration.sh <name> --python` (or --node, --bash)

## Version

- **ax Skill v1.0.0** — for ax v1.1+
- Last updated: July 2026

---

Built for AI agents by [Yusuke Bebé](https://github.com/yusukebe) · Open source on [GitHub](https://github.com/yusukebe/ax)
