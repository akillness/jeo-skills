# OKF — Field & Section Reference

Companion reference for the `okf` skill. Covers the full OKF v0.1
frontmatter schema, Markdown body section conventions, link semantics,
distribution options, and the Python consume helper.

Upstream spec: <https://github.com/google/open-knowledge-format>

---

## 1. Frontmatter field reference

| Field | Required | Type | Notes |
|-------|----------|------|-------|
| `type` | ✅ | string | Kind of knowledge atom. Free string — not an enum. Common values: `BigQuery Table`, `Kafka Topic`, `REST API`, `Metric Definition`, `Runbook`, `Concept`, `Data Source`, `Deprecation Notice` |
| `title` | ✅ | string | Human-readable name (used as heading and search key) |
| `description` | ✅ | string | One-sentence summary. Write so an agent can quote it verbatim without additional context |
| `resource` | ⬜ | URL | Canonical URL of the described resource (console link, API endpoint, dashboard, …) |
| `tags` | ⬜ | string list | YAML list for filtering and discovery: `[sales, orders, revenue]` |
| `timestamp` | ⬜ | ISO 8601 | Last-updated datetime: `2026-06-21T10:00:00Z`. Enables freshness checks |

### Minimal valid OKF atom

```yaml
---
type: Concept
title: Revenue
description: Total USD received from completed orders in a given period, net of refunds and discounts.
---
```

### Fully-specified atom

```yaml
---
type: BigQuery Table
title: Customer Orders
description: One row per completed customer order across all channels.
resource: https://console.cloud.google.com/bigquery?p=acme&d=sales&t=orders
tags: [sales, orders, revenue]
timestamp: 2026-06-21T10:00:00Z
---
```

---

## 2. Markdown body section conventions

Sections are optional. Include only those relevant to the atom type.

| Section | Atom types | Content |
|---------|-----------|---------|
| `# Overview` | All | Free-form context: motivation, ownership, caveats, refresh frequency |
| `# Schema` | Table, API, Data Source | Column/field/parameter table: name, type, description |
| `# Definition` | Metric | SQL or pseudocode definition of the metric |
| `# Examples` | API, Concept | Code blocks with invocation examples |
| `# Joins` / `# Relations` | Table | Links to related atoms with join-key descriptions |
| `# Steps` | Runbook | Numbered response procedure |
| `# Citations` | All | External sources: `[1] [Source name](URL)` |

---

## 3. Link conventions

### Absolute bundle-root links (recommended)

Start with `/` — resolved relative to the bundle root:

```markdown
See the [customers table](/tables/customers.md) for the join key.
```

Stable across file moves. Always prefer absolute links for cross-directory references.

### Relative links

Standard Markdown relative path:

```markdown
See [related concept](./other-concept.md).
```

Use only for files in the same directory that will always move together.

### Relationship semantics

A link asserts a *relationship exists*. The **surrounding prose** (not the
link anchor) names the relationship type (foreign key, depends-on, replaces,
see-also). Consuming agents that build graph views treat all links as
untyped directed edges — the prose provides human/agent-readable relationship
labels.

---

## 4. Common `type` values

Use these consistently within a bundle; document your conventions in a root
`README.md`. Mix of Google-specified examples and community patterns:

| Type string | Used for |
|-------------|---------|
| `BigQuery Table` | BQ table or view |
| `Kafka Topic` | Event stream |
| `REST API` | HTTP endpoint |
| `GraphQL API` | GraphQL schema / type |
| `Metric Definition` | Business KPI or derived metric |
| `Runbook` | Incident response procedure |
| `Concept` | Business term or domain abstraction |
| `Data Source` | External data feed or integration |
| `Deprecation Notice` | Sunset announcement for a resource |
| `Config` | Application or infrastructure configuration reference |
| `Ownership Map` | Team / service / data ownership record |

---

## 5. Bundle layout conventions

```
knowledge-bundle/
├── README.md            ← describes the bundle, type conventions, ownership
├── tables/              ← BigQuery Table, Kafka Topic, etc.
├── metrics/             ← Metric Definition
├── runbooks/            ← Runbook
├── concepts/            ← Concept, Domain Term
├── api/                 ← REST API, GraphQL API
└── config/              ← Config, Infrastructure
```

Subdirectory naming is convention-only — OKF does not mandate structure.
Consumers walk the entire tree, so naming is for human navigation.

---

## 6. Bundle linter (Python)

```python
#!/usr/bin/env python3
"""Validate OKF frontmatter in all .md files under BUNDLE_PATH."""
import os, sys

bundle = sys.argv[1] if len(sys.argv) > 1 else '.'
errors = []

for root, dirs, files in os.walk(bundle):
    for f in files:
        if not f.endswith('.md'):
            continue
        path = os.path.join(root, f)
        text = open(path).read()
        if not text.startswith('---'):
            continue
        fm_end = text.find('---', 3)
        if fm_end == -1:
            errors.append(f'{path}: unclosed YAML frontmatter')
            continue
        fm = text[3:fm_end]
        for field in ('type:', 'title:', 'description:'):
            if field not in fm:
                errors.append(f'{path}: missing required field {field!r}')

if errors:
    for e in errors:
        print('ERROR:', e)
    sys.exit(1)

count = sum(
    1 for r, _, fs in os.walk(bundle)
    for f in fs if f.endswith('.md') and open(os.path.join(r, f)).read().startswith('---')
)
print(f'OK — {count} OKF file(s) valid')
```

Run: `python3 validate_okf.py ./knowledge`

---

## 7. Python consume helper

```python
import os, yaml

def load_okf_bundle(bundle_path: str) -> list[dict]:
    """Return a list of OKF atom dicts: {path, frontmatter, body}."""
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

# Examples
atoms = load_okf_bundle('./knowledge')

# Filter by type
tables  = [a for a in atoms if a['frontmatter'].get('type') == 'BigQuery Table']
metrics = [a for a in atoms if a['frontmatter'].get('type') == 'Metric Definition']

# Filter by tag
revenue = [a for a in atoms if 'revenue' in a['frontmatter'].get('tags', [])]

# Build a context snippet for an agent
context = '\n\n'.join(
    f"## {a['frontmatter']['title']}\n{a['frontmatter']['description']}\n\n{a['body']}"
    for a in tables
)
```

---

## 8. Distribution options

| Method | Command | Best for |
|--------|---------|---------|
| Tarball | `tar -czf bundle.tar.gz knowledge/` | One-shot handoff, email/upload |
| Git repo | `git init && git push` | Versioned, freshness via `timestamp` + commits, PR-based updates |
| Docker volume | `-v $(pwd)/knowledge:/knowledge` | Containerized agent runtimes |
| Filesystem symlink | `ln -s /path/to/knowledge /agents/knowledge` | Local multi-agent setups |

---

## 9. Integration with repo skills

| Need | Skill |
|------|-------|
| Capture raw web sources for OKF content | `scrapling` |
| Maintain a broader git/Obsidian knowledge vault | `llm-wiki` |
| Obsidian vault automation | `obsidian` |
| Build a committed knowledge graph from code/docs | `graphify` |
| Install this skill globally | `npx skills add https://github.com/akillness/jeo-skills --skill okf` |
