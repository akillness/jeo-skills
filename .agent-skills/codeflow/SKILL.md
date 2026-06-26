---
name: codeflow
description: ">"
compatibility: ">"
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
metadata:
  tags: codeflow, codebase-visualization, dependency-graph, blast-radius, code-ownership, health-score, pr-impact, security-scanner, wiki-link-graph, plugin
  platforms: Claude, Codex, Gemini, OpenCode, All
  keyword: codeflow
  version: 1.0.0
  upstream: "https://github.com/braedonsaunders/codeflow"
  installer: "git clone https://github.com/braedonsaunders/codeflow.git && open codeflow/index.html"
  source: akillness/jeo-skills
  license: MIT
---



# codeflow — Visualize Codebase Architecture in Seconds

[CodeFlow](https://github.com/braedonsaunders/codeflow) (braedonsaunders, MIT)
turns any GitHub repository, local folder, PR, or markdown/Obsidian vault into
an **interactive architecture map** — entirely in the browser. It is a single
`index.html` app that loads pinned **React 18 + D3.js 7 + Babel** from CDNs:
**no build process, no `npm install`, no backend, and no data collection** —
your code is fetched directly from GitHub to your browser (or read from local
files) and never leaves your machine. This skill is the routing-first wrapper:
pick an input, choose a visualization mode, read the analysis, and export the
result (or wire the self-updating CodeFlow Card onto a README).

## When to use this skill

- The user opened an **unfamiliar codebase** and wants a fast architecture
  overview — an interactive dependency graph they can drag, zoom, and explore
- The user asks **"if I change this file, what breaks?"** → blast-radius
  analysis over the dependency graph
- The user wants **code ownership** (top contributors per file from git
  history) for a review or "who do I ask?" decision
- The user wants an **A–F codebase health score** (dead code, circular
  dependencies, coupling, security issues) or an **activity heatmap**
- The user wants a **heuristic security / pattern scan** — hardcoded secrets,
  SQL injection, `eval()`, debug statements; singleton/factory/observer/React
  hooks, and anti-patterns (God Objects, high coupling)
- The user wants **PR impact analysis** — paste a PR URL to see affected files
  and the change's blast radius
- The user wants to visualize an **Obsidian vault / markdown directory** as a
  note graph (`[[wiki-links]]` and `[text](./relative.md)` become edges)
- The user wants to **export** the analysis (JSON / Markdown / text / SVG /
  PDF) or drop a **self-updating CodeFlow Card** SVG on a README

## When not to use this skill

- The user wants **editable, hand-authored diagrams** (architecture, ERD, UML,
  sequence, flowchart) → use `drawio` or `mermaid`
- The user wants **token-efficient code search for an agent** over a repo
  (find a symbol, semantic find-related) → use `semble`
- The user wants a **routing-first repo-navigation packet** for
  definitions/references/impact before refactoring → use `codebase-search`
- The user wants a **durable, regenerable knowledge graph** committed to the
  repo (`graphify-out/`) rather than a throwaway browser view → use `graphify`
- The user wants a **deep, language-accurate static-analysis / call graph** —
  CodeFlow's dependency analysis is heuristic (name-matched functions, scoped
  by file + explicit imports) and may miss dynamic imports or renamed runtime
  references; it is a quick overview, not 100% accuracy

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| A modern browser | The whole app runs client-side; nothing is installed |
| `git` (optional) | Only to self-host: `git clone` the one-file repo |
| A GitHub token (optional) | For private repos and higher rate limits — kept in browser memory only, never stored |
| Node.js (optional) | Only the `npx skills` installer or the parser unit tests (`node --test tests/`) need it |

## Instructions

### Step 1 — Choose how to run CodeFlow

| Mode | When | Entry point |
|------|------|-------------|
| **Online** (recommended) | Quickest — public or private repos | <https://codeflow-five.vercel.app/> |
| **Self-host** | Offline / air-gapped / audit the source | `git clone` + `open index.html` |
| **CodeFlow Card** | Self-updating health SVG on a README | GitHub Action in `card/` |

Self-host is a single command — there is **no build step**:

bash
git clone https://github.com/braedonsaunders/codeflow.git
open codeflow/index.html   # or: xdg-open / start, depending on OS


The skill ships [`scripts/install.sh`](scripts/install.sh) to clone (or
update) the repo locally and open it.

### Step 2 — Choose an input

| Input | How |
|-------|-----|
| **Public repo** | Paste `facebook/react` or the full GitHub URL, press `Enter` |
| **Private repo** | Add a [PAT](https://github.com/settings/tokens) (`repo` scope) or GitHub App installation token in the Token field |
| **Local files** | Click **Open Folder** (or drag & drop) — nothing is uploaded |
| **PR impact** | Paste a PR URL to see affected files + blast radius |
| **Markdown vault** | Point at an Obsidian vault / markdown dir for the note graph |

For local scans, set **exclude patterns** (`uploads/**`, `**/cache/**`,
`*.png`) before scanning to skip attachments, caches, and generated assets.

### Step 3 — Pick a visualization mode

| Mode | Colors files by |
|------|-----------------|
| **Folder** | Directory structure |
| **Layer** | Architectural layer (UI, Services, Utils, …) |
| **Churn** | Commit frequency (hot spots) |
| **Blast** | Impact when a file is selected ("what breaks?") |

Keyboard: `Enter` analyze · `+` / `-` zoom · `Escape` close modal.

### Step 4 — Read the analysis

CodeFlow surfaces, all client-side: an **interactive dependency graph**,
**blast-radius** counts per file, **code ownership** (top git contributors),
a **security scanner** (hardcoded secrets/keys, SQL injection, `eval()`, debug
statements), **pattern detection** (singleton/factory/observer/React hooks +
anti-patterns), an **A–F health score** (dead code %, circular deps, coupling,
security), an **activity heatmap**, and **PR impact analysis**. See
[`references/features.md`](references/features.md) for the full surface and the
40+ supported languages.

### Step 5 — Export or embed

- **Export** after analysis: JSON (full data — health, files, functions,
  dependencies, churn, security, patterns, suggestions, language breakdown),
  Markdown, plain text, SVG (graph image), PDF (printable graph), or raw JSON.
- **Share**: the **Share** button copies a link that re-runs the same analysis.
- **CodeFlow Card**: a GitHub Action recomputes a health/scale/fragility SVG on
  every merge and renders it on your README (5 styles, accent presets, opt-in
  PR thermal-receipt comments, light/dark adaptive). See the upstream `card/`.

### Step 6 — Plugin-style installation alongside jeo-skills

This skill folder is plugin-installable through the standard jeo-skills flow so
the wrapper, references, and installer land on disk for any supported runtime:

bash
# Project install (writes into .agents/skills/codeflow/)
npx skills add https://github.com/akillness/jeo-skills --skill codeflow

# Global install for every detected agent
npx skills add -g https://github.com/akillness/jeo-skills --skill codeflow

# Target specific agents
npx skills add -g https://github.com/akillness/jeo-skills --skill codeflow -a claude-code -a codex -y


## Output format

When the user asks `codeflow` for help, return a compact brief:

markdown
# codeflow Routing Brief

## Scope
- Run mode: online | self-host | card-action | undecided
- Input: public-repo | private-repo | local-files | pr-url | markdown-vault
- Goal: overview | blast-radius | ownership | health | security | pr-impact | note-graph

## Recommended next move
- open-online | self-host | open-folder | paste-pr-url | wire-card | export-json

## Why
- 2–3 bullets grounded in the user's packet

## Route-outs
- `drawio` / `mermaid` for editable hand-authored diagrams
- `semble` for token-efficient agent code search over a repo
- `codebase-search` for a repo-navigation packet before refactoring
- `graphify` for a durable, committed knowledge graph


## Best practices

1. **Use a token for anything non-trivial** — unauthenticated GitHub API is
   60 req/hour; a PAT or GitHub App raises it to 5,000 req/hour and speeds up
   analysis (CodeFlow fetches file contents per request).
2. **Keep tokens local** — the token lives only in browser memory and clears
   when the tab closes; never commit it. Prefer a **GitHub App** installation
   token for teams (fine-grained, revocable, audit-logged).
3. **Set exclude patterns before local scans** — skip `node_modules`, caches,
   build output, and binary assets so the graph stays readable and fast.
4. **Treat dependency edges as heuristic** — name-matched functions, scoped by
   file + explicit imports; verify before acting on a blast-radius claim for a
   refactor with dynamic imports or reflection.
5. **Self-host for sensitive code** — it is one auditable `index.html`; local
   file analysis works fully offline with no network calls.
6. **Export JSON for automation** — the JSON report is the integration surface
   for CI/CD, custom reporting, or feeding another tool.

## References

- Upstream repo: <https://github.com/braedonsaunders/codeflow>
- Live app: <https://codeflow-five.vercel.app/>
- CodeFlow Card Action: <https://github.com/braedonsaunders/codeflow/tree/main/card>
- Feature + language reference: [`references/features.md`](references/features.md)
- Installer script: [`scripts/install.sh`](scripts/install.sh)
- Adjacent skills: `../drawio/SKILL.md`, `../semble/SKILL.md`,
  `../codebase-search/SKILL.md`, `../graphify/SKILL.md`
- License: MIT
