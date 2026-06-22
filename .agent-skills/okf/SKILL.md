---
name: okf
description: >
  Create, validate, and consume Google's Open Knowledge Format (OKF) bundles —
  YAML-frontmatter Markdown files with type / title / description / resource /
  tags / timestamp fields for portable, interoperable AI-agent knowledge sharing.
  OKF formalizes the LLM-Wiki pattern into a vendor-neutral open specification
  so any producer can write and any agent can consume without translation.
  Routes: use `llm-wiki` for raw source capture + vault maintenance,
  `obsidian` for Obsidian-vault workflows, `graphify` for durable committed
  graphs, `scrapling` for web-content extraction into OKF docs.
  Triggers on: okf, open knowledge format, knowledge bundle, okf document,
  llm wiki standard, knowledge atom, agent context format, okf frontmatter,
  okf bundle, knowledge interoperability.
allowed-tools: Read Write Edit Bash Grep Glob WebFetch
compatibility: >
  Universal — pure Markdown + YAML, no runtime dependencies. Works in any agent
  that can read and write files (Claude Code, Codex, Gemini CLI, OpenCode,
  Cursor, Copilot). Plugin-installable via `npx skills add`. Routes raw source
  collection to `llm-wiki`, Obsidian vault automation to `obsidian`, durable
  knowledge graphs to `graphify`, and web scraping into OKF docs to `scrapling`.
metadata:
  tags: okf, open-knowledge-format, knowledge-bundle, llm-wiki, knowledge-graph, metadata, context-engineering, interoperability, yaml-frontmatter, google, agent-context
  platforms: Claude, Codex, Gemini, Cursor, Copilot, OpenCode, All
  keyword: okf
  version: "1.0.0"
  upstream: https://github.com/google/open-knowledge-format
  source: akillness/jeo-skills
  license: MIT
---

# OKF — Open Knowledge Format

[Open Knowledge Format (OKF)](https://github.com/google/open-knowledge-format)
is an open specification proposed by the Google Cloud Data team that formalizes
the **LLM-Wiki pattern** into a portable, interoperable format. Knowledge is
stored as **YAML-frontmatter Markdown files inside a directory** (a "bundle").
Any producer can write it, any agent can consume it — no proprietary SDK, no
special runtime, no lock-in.

> **Core idea**: Just markdown. Just files. Just YAML frontmatter.

## When to use this skill

- You need to create **structured knowledge documents** an AI agent can parse —
  table schemas, API specs, metric definitions, runbooks, deprecation notices
- You want a **portable knowledge bundle** that survives tool changes (no
  vendor catalog dependency)
- You're building a **multi-agent context layer** where different systems need
  the same organizational knowledge (join paths, business KPIs, incident guides)
- You want to **cross-link knowledge atoms** into a richer relationship graph
  than a parent/child hierarchy allows
- You need to publish or **distribute knowledge** as a tarball, git repo, or
  filesystem mount
- You want to formally align your LLM-wiki output with the OKF v0.1 standard

## When NOT to use this skill

- Raw web-source capture and vault-level wiki maintenance → `llm-wiki`
- Obsidian vault automation (plugin dev, CLI, URI handoff) → `obsidian`
- Durable committed knowledge graphs from code/docs → `graphify`
- Web scraping to feed knowledge documents → `scrapling`

## OKF Structure

### The bundle directory

```
knowledge-bundle/
├── tables/
│   ├── orders.md
│   └── customers.md
├── metrics/
│   └── wau.md
├── runbooks/
│   └── outage-response.md
└── concepts/
    └── revenue-calculation.md
```

Each file is a **knowledge atom** — one YAML-frontmatter Markdown document.
The directory itself is the distributable unit (tarball / git / filesystem mount).

### Frontmatter schema (OKF v0.1)

```yaml
---
type: <string>          # (required) kind of atom: "BigQuery Table", "API Endpoint",
                        #   "Concept", "Runbook", "Metric Definition", "Data Source", …
title: <string>         # (required) human-readable name
description: <string>   # (required) one-sentence summary the agent can quote verbatim
resource: <url>         # (optional) URL to the described resource
tags: [<tag>, …]        # (optional) list for filtering / discovery
timestamp: <ISO 8601>   # (optional) last-updated datetime, e.g. 2026-06-21T10:00:00Z
---
```

> Only `type`, `title`, and `description` are strictly required.
> Add `resource` whenever the atom is bound to a live system or URL.
> `timestamp` enables freshness checks for consuming agents.

### Markdown body sections

| Section | Purpose |
|---------|---------|
| `# Overview` | Free-form context — motivation, ownership, caveats |
| `# Schema` | Structural description of columns / fields / parameters (table format recommended) |
| `# Examples` | Concrete usage examples, primarily code blocks |
| `# Joins` / `# Relations` | Cross-links to related atoms |
| `# Citations` | External sources backing the document's claims |

Sections are **optional**; include only those relevant to the atom type.

## Instructions

### Step 1 — Bootstrap a bundle

```bash
# Create the bundle root
mkdir my-knowledge-bundle && cd my-knowledge-bundle

# Scaffold a directory layout
mkdir -p tables metrics runbooks concepts api
```

For an existing project, place the bundle alongside code or in its own repo:

```
my-project/
├── src/
├── docs/
└── knowledge/          ← OKF bundle lives here
    ├── tables/
    └── metrics/
```

### Step 2 — Author a knowledge atom

#### Table atom example

```markdown
---
type: BigQuery Table
title: Customer Orders
description: One row per completed customer order across all channels.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, orders, revenue]
timestamp: 2026-06-21T10:00:00Z
---

# Overview

Primary fact table for order analytics. Owned by the Data Engineering team.
Refreshed hourly from the Kafka `orders` topic.

# Schema

| Column        | Type      | Description                                          |
|---------------|-----------|------------------------------------------------------|
| `order_id`    | STRING    | Globally unique order identifier.                    |
| `customer_id` | STRING    | Foreign key into [customers](/tables/customers.md).  |
| `total_usd`   | NUMERIC   | Order total in US dollars after discounts.           |
| `placed_at`   | TIMESTAMP | When the customer submitted the order (UTC).         |
| `channel`     | STRING    | `web` \| `mobile` \| `api` \| `partner`.             |

# Joins

- Join to [customers](/tables/customers.md) on `customer_id` for user attributes.
- Join to [products](/tables/products.md) via [order_items](/tables/order_items.md).

# Citations

[1] [BigQuery table](https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders)
```

#### Metric definition atom

```markdown
---
type: Metric Definition
title: Weekly Active Users (WAU)
description: Count of distinct users who triggered at least one qualifying event in the trailing 7-day window.
tags: [kpi, growth, users]
timestamp: 2026-06-21T10:00:00Z
---

# Overview

Owned by the Growth Analytics team. Used in all executive dashboards.

# Definition

```sql
SELECT
  DATE_TRUNC(event_date, WEEK) AS week_start,
  COUNT(DISTINCT user_id)      AS wau
FROM [events](/tables/events.md)
WHERE event_name IN ('session_start', 'purchase', 'share')
  AND event_date >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
GROUP BY 1
\```

# Relations

- Source table: [events](/tables/events.md)
- Related metric: [Monthly Active Users (MAU)](/metrics/mau.md)
```

#### Runbook atom

```markdown
---
type: Runbook
title: Database Connection Pool Exhaustion
description: Steps to diagnose and recover from connection pool exhaustion on the primary Postgres cluster.
tags: [incident, database, postgres, oncall]
timestamp: 2026-06-21T10:00:00Z
---

# Overview

Triggered when `pg_stat_activity` shows ≥95% pool utilization or `FATAL: remaining connection slots are reserved` errors appear.

# Steps

1. Check active connections: `SELECT count(*) FROM pg_stat_activity;`
2. Identify blocking queries: see [slow-query runbook](/runbooks/slow-queries.md).
3. Kill idle connections older than 5 min if count > threshold.
4. Scale pool via [connection pooler config](/concepts/pgbouncer-config.md).
5. Page DBA on-call if not resolved in 10 min.

# Citations

[1] [PgBouncer docs](https://www.pgbouncer.org/)
```

### Step 3 — Cross-link atoms

Use **absolute bundle-root links** (recommended — stable across moves):

```markdown
See the [customers table](/tables/customers.md) for join key details.
```

Use **relative links** for co-located files:

```markdown
See [related concept](./other-concept.md).
```

> **Design rule**: a link asserts a *relationship exists*; the surrounding prose
> (not the link itself) names the relationship type (parent, foreign-key, join,
> depends-on). This keeps the graph type-free and consumer-flexible.

### Step 4 — Validate a bundle

Run a basic structural lint before consuming or distributing:

```bash
# Check all .md files have required frontmatter fields
python3 -c "
import os, sys
import re

bundle = '.'  # path to bundle root
errors = []

for root, dirs, files in os.walk(bundle):
    for f in files:
        if not f.endswith('.md'):
            continue
        path = os.path.join(root, f)
        text = open(path).read()
        if not text.startswith('---'):
            continue  # skip non-OKF files
        fm_end = text.find('---', 3)
        if fm_end == -1:
            errors.append(f'{path}: unclosed frontmatter')
            continue
        fm = text[3:fm_end]
        for field in ('type:', 'title:', 'description:'):
            if field not in fm:
                errors.append(f'{path}: missing required field {field!r}')

if errors:
    for e in errors: print('ERROR:', e)
    sys.exit(1)
else:
    print('OK — all OKF files valid')
"
```

### Step 5 — Distribute a bundle

```bash
# As a tarball
tar -czf my-knowledge-bundle.tar.gz my-knowledge-bundle/

# As a git repo (recommended for versioning + freshness via timestamp)
git init my-knowledge-bundle && cd my-knowledge-bundle
git add . && git commit -m "Initial OKF bundle"
git remote add origin https://github.com/acme/knowledge-bundle.git
git push -u origin main

# As a filesystem mount in a Docker container
# docker run -v $(pwd)/my-knowledge-bundle:/knowledge ...
```

### Step 6 — Consume a bundle from an AI agent

```python
import os, re, yaml

def load_okf_bundle(bundle_path: str) -> list[dict]:
    """Load all OKF atoms from a bundle directory."""
    atoms = []
    for root, _, files in os.walk(bundle_path):
        for f in files:
            if not f.endswith('.md'):
                continue
            path = os.path.join(root, f)
            text = open(path).read()
            if not text.startswith('---'):
                continue
            fm_end = text.find('---', 3)
            if fm_end == -1:
                continue
            try:
                fm = yaml.safe_load(text[3:fm_end])
                body = text[fm_end + 3:].strip()
                atoms.append({
                    'path': os.path.relpath(path, bundle_path),
                    'frontmatter': fm,
                    'body': body
                })
            except Exception:
                pass
    return atoms

# Usage
atoms = load_okf_bundle('./knowledge')
tables = [a for a in atoms if a['frontmatter'].get('type') == 'BigQuery Table']
```

### Step 7 — Integrate with llm-wiki

OKF bundles are compatible with the repo's `llm-wiki` skill workflow:

```bash
# After running llm-wiki to capture raw sources, promote to OKF-compliant format:
# 1. Add required frontmatter (type, title, description) to each wiki/*.md
# 2. Add resource: field pointing to the source URL
# 3. Organize into typed subdirectories (tables/, metrics/, concepts/, …)
# 4. Run the Step 4 validator

# Use the llm-wiki skill for:
#   - Raw source capture and summarization
#   - Query filing and lint passes
#   - Obsidian/git vault maintenance

# Use OKF for:
#   - Portable, interoperable distribution to other teams/agents
#   - Standard frontmatter that consuming agents can parse without a custom schema
```

### Step 8 — Plugin install

```bash
# Project install
npx skills add https://github.com/akillness/jeo-skills --skill okf

# Global install
npx skills add -g https://github.com/akillness/jeo-skills --skill okf

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill okf -a claude-code -a codex -y
```

Also ships [`scripts/install.sh`](scripts/install.sh) — a one-shot helper that
verifies the `pyyaml` dependency and optionally validates an existing bundle.
See [`references/usage.md`](references/usage.md) for the full field and
section reference.

## Output format

When the user asks `okf` for help, return a compact brief:

```markdown
# OKF Routing Brief

## Scope
- Task: create-bundle | author-atom | validate | distribute | consume | migrate-from-llm-wiki
- Atom type: table | metric | runbook | concept | api-endpoint | other

## Recommended next move
- bootstrap-bundle | author-atom | validate | distribute | consume | llm-wiki-promote

## Why
- 2-3 bullets grounded in the user's request

## Route-outs
- `llm-wiki` for raw source capture and vault maintenance
- `obsidian` for Obsidian vault automation
- `graphify` for durable committed knowledge graphs
- `scrapling` for web-content extraction into OKF documents
```

## Best practices

1. **One atom, one concept** — each file covers exactly one table, metric,
   API endpoint, runbook, or concept; split when scope grows beyond one topic.
2. **description is the agent's headline** — write it so an agent can quote it
   verbatim in a response without additional context.
3. **Absolute bundle links over relative** — `/tables/customers.md` survives
   file moves; `../tables/customers.md` silently breaks.
4. **Timestamp every production atom** — consuming agents can skip stale atoms
   based on `timestamp`; without it, freshness is undetectable.
5. **Type is a free string, not an enum** — `"BigQuery Table"`, `"Kafka Topic"`,
   `"REST API"`, `"Runbook"`, `"Metric"` are all valid; pick consistently within
   a bundle and document the conventions in a root `README.md`.
6. **Validate before distributing** — run the Step 4 linter; broken frontmatter
   causes silent consume failures in downstream agents.
7. **Git-track for freshness** — a git repo lets consumers detect staleness via
   commit dates and receive diffs via standard `git pull`.

## References

- OKF Specification: <https://github.com/google/open-knowledge-format>
- PyTorchKR discussion (Korean): <https://discuss.pytorch.kr/t/open-knowledge-format-okf-google-ai-feat-llm-wiki/10701>
- LLM-Wiki pattern: see `llm-wiki` skill (`../llm-wiki/SKILL.md`)
- Obsidian integration: see `obsidian` skill (`../obsidian/SKILL.md`)
- Knowledge graph: see `graphify` skill (`../graphify/SKILL.md`)
- Web scraping into OKF: see `scrapling` skill (`../scrapling/SKILL.md`)
- Local usage reference: [`references/usage.md`](references/usage.md)
- Local installer: [`scripts/install.sh`](scripts/install.sh)
