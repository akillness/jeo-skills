# codeflow feature + language reference

Upstream: <https://github.com/braedonsaunders/codeflow> · Live: <https://codeflow-five.vercel.app/>

## Analysis surface

| Feature | What it gives you |
|---------|-------------------|
| Interactive dependency graph | Drag/zoom/explore; click a node to highlight its dependencies |
| Blast radius analysis | Select a file → how many files break if you change it |
| Code ownership | Top contributors per file from git history |
| Security scanner (heuristic) | Hardcoded secrets/API keys, SQL injection, `eval()`, debug statements in prod |
| Pattern detection | Singleton, Factory, Observer/Event, React custom hooks |
| Anti-pattern detection | God Objects, high coupling |
| Health score (A–F) | Dead code %, circular dependencies, coupling metrics, security issues |
| Activity heatmap | Color files by commit frequency (hot spots) |
| PR impact analysis | Paste a PR URL → affected files + blast radius of the change |
| Markdown & wiki-link graph | `[[wiki-links]]` and `[text](./relative.md)` become edges; notes are `note`-layer nodes |
| Local file analysis | Browser-only, offline, drag & drop, recursive folder scan, exclude patterns |

## Visualization modes

| Mode | Colors by |
|------|-----------|
| Folder | Directory structure |
| Layer | Architectural layer (UI, Services, Utils, …) |
| Churn | Commit frequency (hot spots) |
| Blast | Impact when a file is selected |

## Inputs

| Input | How |
|-------|-----|
| Public repo | `facebook/react` or full GitHub URL, then `Enter` |
| Private repo | PAT (`repo` scope) or GitHub App installation token in the Token field |
| Local files | Open Folder / drag & drop (nothing uploaded) |
| PR URL | Paste a PR URL for impact analysis |
| Markdown vault | Obsidian vault / markdown directory for the note graph |

## Exports

| Format | Contents |
|--------|----------|
| JSON report | Repo metadata + health score, files (functions, deps, churn), function stats (callers/usage), security/patterns/architecture issues, duplicate-code + layer violations, suggestions, language breakdown, folder structure |
| Markdown | Human-readable formatted report |
| Plain text | Simple text format |
| SVG | Dependency graph image |
| PDF | Printable dependency graph |
| Raw JSON | Simplified data export |

## Authentication & rate limits

| Method | Rate limit |
|--------|------------|
| No token | 60 requests/hour |
| Personal Access Token (`repo` scope) | 5,000 requests/hour |
| GitHub App (installation token) | 5,000 requests/hour per installation — fine-grained, revocable, audited |

Tokens are held only in browser memory and cleared when the tab closes.

## Supported languages (function extraction + dependency analysis)

JavaScript (`.js`,`.jsx`) · TypeScript (`.ts`,`.tsx`) · HTML inline scripts
(`.html`,`.htm`,`.xhtml`) · Python (`.py`) · Java (`.java`) · Go (`.go`) ·
Ruby (`.rb`) · PHP (`.php`) · Vue (`.vue`) · Svelte (`.svelte`) · Rust (`.rs`) ·
C (`.c`,`.h`) · C++ (`.cpp`,`.cc`,`.cxx`,`.hpp`,`.hh`,`.hxx`) · C# (`.cs`) ·
Swift (`.swift`) · Kotlin (`.kt`,`.kts`) · Scala (`.scala`,`.sc`) · Groovy
(`.groovy`,`.gvy`) · Elixir (`.ex`,`.exs`) · Erlang (`.erl`,`.hrl`) · Haskell
(`.hs`,`.lhs`) · Lua (`.lua`) · R (`.r`,`.R`) · Julia (`.jl`) · Dart (`.dart`) ·
Perl (`.pl`,`.pm`) · Shell (`.sh`,`.bash`,`.zsh`,`.fish`) · PowerShell
(`.ps1`,`.psm1`,`.psd1`) · F# (`.fs`,`.fsi`,`.fsx`) · OCaml (`.ml`,`.mli`) ·
Clojure (`.clj`,`.cljs`,`.cljc`) · Elm (`.elm`) · VBA
(`.vba`,`.bas`,`.cls`,`.xlsm`,`.xlsb`,`.xlam`).

## Architecture

Single `index.html` app. Pinned CDN deps: **React 18**, **D3.js 7**, **Babel**
(for JSX). Modules: Parser · GitHub API · D3 graph → React app. **Zero build
dependencies to install.**

## CodeFlow Card (GitHub Action)

A GitHub Action drops an auto-updating SVG card on a README, recomputed on
every merge by the same analyzer as the web app: health grade, scale,
fragility, and hidden costs. Five styles, accent presets, opt-in PR
thermal-receipt comments, privacy mode for public repos, light/dark adaptive.
Setup: <https://github.com/braedonsaunders/codeflow/tree/main/card>.

## Self-host & tests

```bash
git clone https://github.com/braedonsaunders/codeflow.git
open codeflow/index.html        # no build, no npm install
node --test tests/              # optional: markdown / wiki-link parser unit tests
```

`tests/verify-brain-vault.mjs` verifies bundled fixtures and can scan a real
local vault when `BRAIN_VAULT=/path/to/vault` is set.

## Privacy

Runs 100% in the browser; GitHub API calls go directly from the browser;
never stores code or tokens; works with private repos via a local token;
no analytics or tracking.

## Notes

Dependency analysis is **heuristic**: unique functions are matched by name,
duplicate names are scoped by file + explicit imports before edges are drawn.
It may miss dynamic imports or renamed runtime references — designed for a
quick overview, not 100% accuracy.
