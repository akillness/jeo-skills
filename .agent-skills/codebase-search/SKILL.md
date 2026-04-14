---
name: codebase-search
description: >
  Search and navigate codebases with an evidence-first workflow. Use when the user
  needs repo navigation, call-site tracing, code archaeology, ownership discovery,
  impact analysis, entry-point mapping, config hunting, or pre-change discovery —
  even if they do not explicitly say "search". Choose between exact-text search,
  symbol/indexed search, structural search, and file discovery, then hand off cleanly
  to debugging, refactoring, review, or graph-based architecture analysis.
allowed-tools: Read Grep Glob Bash
metadata:
  tags: codebase-search, code-navigation, repo-triage, impact-analysis, grep, ripgrep, ast-grep
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "2.0"
---

# Codebase Search

## When to use this skill
- The user needs to **find where something lives** before changing it.
- The user asks for **call sites, ownership, entry points, imports, configs, or impact analysis**.
- The task is mostly **repo navigation / evidence gathering**, not diagnosis or refactoring yet.
- The codebase is large enough that random file reading will waste time.
- The user wants to know **what to inspect next** before implementation, review, or bug fixing.

Do **not** use this skill as the main workflow when:
- The user already knows the file and needs root-cause diagnosis → use `debugging` or `log-analysis`.
- The user is changing structure while preserving behavior → use `code-refactoring`.
- The user wants persistent graph-backed architecture mapping across a whole corpus → use `graphify`.
- The user wants judgment on a diff or PR → use `code-review`.

## Core idea
Codebase search is a staged narrowing workflow:
1. classify the search goal
2. choose the cheapest search lane that can answer it
3. narrow scope by path / language / owner / symbol
4. read the winning files
5. return a compact evidence map with next route-outs

Do **not** dump random search output. The goal is decision-quality navigation.

## Instructions

### Step 1: Classify the request
First identify which search job this really is:

| Search job | Typical user phrasing | Best starting lane |
|---|---|---|
| Known text lookup | "Find this env var", "where is this error string used?" | exact-text search |
| Symbol / API tracing | "Where is this function called?" | symbol/indexed search or exact-text fallback |
| Structural pattern hunt | "Find all async handlers missing auth", "match this AST shape" | structural search |
| File / ownership discovery | "Where does config live?", "what files implement checkout?" | file discovery + exact-text search |
| Architecture / impact map | "What do I need to inspect before changing X?" | staged search + evidence map |

If the task mixes multiple jobs, start with the narrowest lane that reduces uncertainty fastest.

### Step 2: Choose the search lane

#### Lane A — Exact-text search
Use for known names, strings, flags, log lines, SQL fragments, and import paths.

Good fits:
- function/class names you already know
- environment variables
- error messages
- config keys
- literal API routes

Default pattern:
```bash
rg -n --hidden --glob '!node_modules' --glob '!dist' 'search_term' .
```

Escalate with:
- case-insensitive search when naming is inconsistent
- file globs for language targeting
- path constraints when the repo is noisy
- regex only when exact text is not enough

#### Lane B — Symbol / indexed search
Use when the user needs definitions, references, or repository-wide navigation around symbols.

Good fits:
- function/class/interface definitions
- call sites / references
- import trees
- public API ownership
- symbol lookup across a monorepo or hosted repo

Prefer repository-native or indexed search when available because symbol search usually beats grep for:
- overloaded names
- cross-language references
- exact symbol boundaries
- very large repos

If indexed search is unavailable, fall back to exact-text patterns plus targeted file reading.

#### Lane C — Structural search
Use when syntax shape matters more than exact spelling.

Good fits:
- "all `fetch()` calls without timeout handling"
- "React effects missing cleanup"
- "Python functions with broad `except:`"
- codemod prep / repeated pattern inventory

Use AST-aware tools such as `ast-grep` when available. If not available, approximate with regex only when false positives are acceptable and label the lower confidence.

#### Lane D — File discovery
Use when the first task is to locate the likely file set.

Good fits:
- test files
- config files
- build scripts
- route handlers
- migrations
- engine/editor scripts
- content pipeline folders

Default pattern:
```bash
find . -type f | rg 'pattern'
```

Or use glob/file-search equivalents when available in the client.

### Step 3: Narrow scope before reading everything
Apply at least one narrowing move before reading lots of files:
- limit by directory (`backend/`, `src/`, `packages/checkout/`, `Content/`, `Assets/`)
- limit by file type (`*.ts`, `*.py`, `*.sql`, `*.cs`, `*.cpp`)
- limit by ownership or subsystem name
- separate generated/vendor folders from authored code
- prefer entry points and adapters before leaf utilities

When the repo is unfamiliar, find these anchors first:
1. app entry points
2. routing layer / CLI entry
3. configuration loading
4. service or domain modules
5. tests/examples that exercise the feature

### Step 4: Read winners, not the whole match list
After search results come back:
1. pick the likely definition / entry file
2. pick 1–3 important call sites or consumers
3. pick 1 config/test file if the behavior depends on setup or verification
4. read those files and summarize the flow

Do **not** paste 100 raw matches unless the user explicitly asked for exhaustive output.

### Step 5: Return an evidence map
Default output shape:

```markdown
## Search brief
- Goal: [what I was trying to locate]
- Lane used: exact-text | symbol/indexed | structural | file discovery | mixed
- Scope: [repo/subdirs/file types searched]

## Best entry points
- `path/to/file`: why it matters
- `path/to/other-file`: why it matters

## Key evidence
- `path:line` — what it shows
- `path:line` — how it connects

## Likely flow / ownership
- entry → service → adapter → test/config

## Next route-out
- `debugging` for diagnosis
- `code-refactoring` for structural change
- `code-review` for diff judgment
- `graphify` for persistent architecture mapping
```

### Step 6: Use search-mode heuristics

#### For bug-location requests
- start from the error string, log token, route, flag, or recent change
- find the definition and the highest-signal consumers
- route to `debugging` once the likely failure path is mapped

#### For impact analysis
- find definition
- find all important call sites / consumers
- find tests, docs, and config tied to the symbol
- explicitly separate **must-update** files from **maybe-affected** files

#### For code archaeology
- look for entry points, README/docs, examples, and integration tests first
- map the main workflow before diving into helpers
- prefer naming/ownership explanations over exhaustive command dumps

#### For config hunting
- locate loader code first
- then locate env/example/default files
- then locate validation or schema enforcement
- then find runtime consumers

#### For game/tooling repos
- separate runtime code, editor/build scripts, assets/content, and platform packaging
- prefer subsystem boundaries over engine-wide grep floods
- look for build configs, plugin manifests, and pipeline scripts early

### Step 7: Route out aggressively when search is no longer the bottleneck
Hand off when the next step becomes a different job:
- **Root cause / reproduction / hypotheses** → `debugging`
- **Raw log triage** → `log-analysis`
- **Behavior-preserving cleanup or codemod planning** → `code-refactoring`
- **Whole-repo persistent structure map** → `graphify`
- **Diff/PR judgment** → `code-review`

## Examples

### Example 1: Pre-change discovery
**Prompt:**
> Find where auth is implemented and what files I need to inspect before changing it.

**Good response shape:**
- identify entry points (middleware/router/auth service)
- identify config/env loader
- identify tests or integration points
- return a compact evidence map and next files to inspect

### Example 2: Impact analysis
**Prompt:**
> Trace all call sites of `calculatePrice()` and summarize impact before refactoring.

**Good response shape:**
- definition file
- major consumers grouped by subsystem
- tests/contracts depending on it
- must-update vs maybe-affected list
- route-out to `code-refactoring`

### Example 3: Structural query
**Prompt:**
> Find all async handlers that call the database without timeout or cancellation handling.

**Good response shape:**
- choose structural search
- describe match pattern
- list highest-confidence hits
- state confidence limits if regex fallback was required

### Example 4: Config ownership
**Prompt:**
> Search this monorepo for who owns S3 config and where it is validated.

**Good response shape:**
- config loader / schema file
- runtime consumers
- deployment or env examples
- likely owning package/team/subsystem

## Best practices
1. Prefer the **cheapest lane that can answer the question**.
2. Narrow scope before reading large match sets.
3. Return an evidence map, not a terminal transcript.
4. Separate search from diagnosis, refactoring, and review.
5. Label confidence when structural intent is approximated with plain text search.
6. Use tests, examples, and config loaders as high-signal navigation anchors.
7. For monorepos, group findings by package or subsystem.

## References
- `references/search-modes.md`
- `references/evidence-map-template.md`
- `references/handoff-boundaries.md`
- GitHub Code Search syntax docs: https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax
- Sourcegraph code search docs: https://sourcegraph.com/docs/code_search
- ast-grep introduction: https://ast-grep.github.io/guide/introduction.html
- ripgrep guide: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
