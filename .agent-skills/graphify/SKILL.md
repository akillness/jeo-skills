---
name: graphify
description: >
  Drive Graphify from its CLI to build, refresh, query, export, and serve a durable
  code/corpus knowledge graph. Use when the user wants `.graphify/GRAPH_REPORT.md`,
  `graph.json`, `graph.html`, `graphify update`/`summary`/`query`/`path`/`explain`/`tree`,
  change-aware review context, git-hook or watch-based refresh, a stdio MCP graph server,
  or an install into jeo, jeopi, gjc, opencode, Claude, Codex, or Gemini. Also covers the
  honest structural fallback when native extraction is empty or misleading. Route simple
  locate/reference work to `codebase-search`, narrative knowledge-base work to `llm-wiki`,
  and project-memory handoff to `opencontext`. Triggers on: graphify, graphify update,
  graphify query, knowledge graph CLI, GRAPH_REPORT.md, graph.json, codebase graph,
  graph refresh, graphify install, graphify serve, review context, affected flows.
allowed-tools: Bash Read Write Grep Glob
compatibility: >
  Requires the `graphifyy` PyPI package (Python 3.10+) so the `graphify` CLI is on PATH.
  Assistant integrations exist for claude, codex, gemini, opencode, aider, copilot, claw,
  droid, trae, trae-cn, hermes, kimi, kiro, antigravity, vscode and windows variants; jeo,
  jeopi and gjc have no platform id and install through the shared `~/.agents/skills` root.
metadata:
  tags: knowledge-graph, codebase-analysis, graphrag, architecture, graphify, cli, corpus-analysis, persistent-memory
  platforms: Claude, Codex, Gemini, OpenCode, jeo, jeopi, gjc
  version: "3.0"
  source: https://github.com/Graphify-Labs/graphify
---

# Graphify

Graphify is a **CLI**. The primary path for every request in this skill is a real
`graphify …` command, not a slash command and not an improvised Python script.

Use this skill when the main question is **"which graphify command answers this, over what
scope, and what should we read next?"**

The job is to:
1. classify the request into one graph packet,
2. choose one CLI mode,
3. scope the corpus before runtime or token cost explodes,
4. report artifacts and any degraded output truthfully,
5. route search-only, wiki-only, or project-memory work to the right neighboring skill.

Read [references/cli-command-map.md](references/cli-command-map.md) for the full command
surface with real flags.
Read [references/install-matrix.md](references/install-matrix.md) before installing anything —
especially for **jeo / jeopi / gjc / opencode**.
Read [references/mode-packets-and-route-outs.md](references/mode-packets-and-route-outs.md) for
an unfamiliar request, and [references/build-and-fallback-recipes.md](references/build-and-fallback-recipes.md)
when native extraction is weak.

## CLI quickstart

```bash
pip install graphifyy                       # PyPI package is graphifyy; the binary is graphify
graphify --version

graphify scope                              # what would actually be graphed?
graphify update .                           # build -> .graphify/graph.json + .graphify/GRAPH_REPORT.md
graphify summary                            # hubs, communities, representative nodes
graphify query "where is auth enforced?" --budget 1500
graphify explain <node>                     # one node, plain language
graphify path <source> <target>             # shortest path between two nodes
graphify tree <node> --depth 2              # local neighbourhood
graphify export html                        # -> .graphify/graph.html
```

Three facts that keep answers truthful:

- **`graphify build` does not exist.** The build command is `graphify update`. `graphify build
  --help` silently falls through to the root help.
- **State lives in `.graphify/`**, not `graphify-out/`. `graphify-out/` is the legacy layout;
  `graphify migrate-state` moves it. Every `--graph <path>` flag defaults to
  `<cwd>/.graphify/graph.json`.
- **`graph.html` is not produced by `graphify update`.** It comes from `graphify export html`.

## When to use this skill

- The user explicitly wants `GRAPH_REPORT.md`, `graph.json`, `graph.html`, a codebase graph, or
  a persistent knowledge graph
- The request is about repo/corpus structure, relationship tracing, path queries, or
  architecture discovery that should survive the current session
- The corpus mixes code, docs, PDFs, notes, or screenshots and the user wants one durable
  structure layer
- The user wants to refresh, query, or explain an existing graph instead of re-reading raw files
- The user wants change-aware review context, affected execution flows, or risk scoring for a
  diff or PR
- The user wants Graphify installed into jeo, jeopi, gjc, opencode, Claude, Codex, Gemini, or
  another supported agent

## When not to use this skill

- **Only needs to find a symbol, file owner, config location, or reference chain** → `codebase-search`
- **Wants a persistent markdown knowledge base or filed research notes** → `llm-wiki`
- **Wants project/repo memory, manifests, or cross-agent handoff packets** → `opencontext`
- **Needs dependency-only JS/TS analysis or a quick repo tree diagram**, not a durable graph
- **Generic GraphRAG / text-KG architecture talk** with no concrete Graphify ask

## Install for jeo / jeopi / gjc / opencode

`graphify install [platform]` accepts exactly these ids: `claude`, `codex`, `gemini`,
`opencode`, `aider`, `copilot`, `claw`, `droid`, `trae`, `trae-cn`, `hermes`, `kimi`, `kiro`,
`antigravity`, `antigravity-windows`, `vscode-copilot-chat`, `windows`, `vscode`.

**`jeo`, `jeopi` and `gjc` are not platform ids** — `graphify install jeo` will fail the same way
`graphify install agents` does (`error: unknown platform`). Per this repo's
`setup-all-skills-prompt.md`, those three discover the shared `~/.agents/skills` root natively,
which the unconditional `universal` id populates. So:

```bash
# CLI for everyone
pip install graphifyy && graphify --version

# skill into the shared root that jeo, jeopi, gjc and sst/opencode all read
npx skills add https://github.com/akillness/jeo-skills --skill graphify -a universal
ls "${SKILLS_ROOT:-$HOME/.agents/skills}/graphify/SKILL.md"

# optional: opencode plugin + tool.execute.before hook (sst/opencode only)
graphify install opencode            # or: graphify install opencode --project
```

`graphify install opencode --project` writes `.opencode/skills/graphify/SKILL.md`,
`.opencode/plugins/graphify.js`, `.opencode/opencode.json`, and an `AGENTS.md` section.
`graphify install claude --project` writes `.claude/skills/graphify/SKILL.md`,
`.claude/settings.json` PreToolUse hooks, and a `CLAUDE.md` section.

The archived Go `opencode-ai/opencode` TUI has **no** skill loader — `graphify install opencode`
will not surface the skill there; bridge it as a command file or just use the CLI. Full detail:
[references/install-matrix.md](references/install-matrix.md).

## Instructions

### Step 1: Normalize the request into one packet

- `repo-structure-packet` — map a codebase or subsystem before editing
- `relationship-trace-packet` — answer a path/query/explain question from an existing graph
- `mixed-corpus-memory-packet` — build durable structure across code + docs + assets
- `review-diff-packet` — produce review context or affected flows for changed files
- `install-packet` — get Graphify into an agent for always-on use
- `refresh-or-fallback-packet` — update an existing graph, recover from weak output, or fall back

Start from the packet the user already has. Do not force every request through a feature tour.

### Step 2: Pick one CLI mode

| Mode | Primary commands |
| --- | --- |
| `cli-build` | `graphify scope` → `graphify update .` |
| `cli-query` | `graphify summary` → `query` / `explain` / `path` / `tree` |
| `cli-export` | `graphify export html\|wiki\|obsidian\|svg\|graphml\|neo4j` |
| `incremental-refresh` | `graphify check-update` → `graphify update` / `watch` / `hook install` |
| `review-context` | `graphify review-context` / `affected-flows` / `detect-changes` |
| `agent-serve` | `graphify serve` (stdio MCP server for `graph.json`) |
| `install` | `graphify install <platform>` or the `~/.agents/skills` route |
| `structural-fallback` | build the smallest truthful structural graph when native extraction is empty or misleading |

Name one primary mode. Mention at most one fallback.

### Step 3: Scope before spending

Run `graphify scope` first on anything unfamiliar. Good defaults:

- repo root only when repo-wide architecture is genuinely the ask
- `src/`, `app/`, `packages/<pkg>/`, or one service directory for implementation work
- `raw/`, `docs/`, or a mixed research folder for corpus graphing
- an existing `.graphify/` when the job is query/refresh rather than rebuild

Use `--scope auto|committed|tracked|all` and `.graphifyignore` instead of hoping runtime behaves.
If the request is really locate/reference, route to `codebase-search`.

### Step 4: Run the narrowest command set

Keep it to the commands the mode needs. Do not chain a build, an export, a wiki, and a watch
loop when the user asked one question.

### Step 5: Report degraded output honestly

Verified behavior: with no LLM API key configured, `graphify update .` still writes
`graph.json` and `GRAPH_REPORT.md`, but prints:

```
[graphify label] warning: community labeling failed (...); using Community N placeholders.
[graphify describe] description generation failed (...); continuing without descriptions.
```

When that happens, say the graph is structurally complete but unlabeled/undescribed, and offer
`graphify update --fill-missing` once a backend is configured. Never present placeholder
`Community N` names as meaningful clusters.

### Step 6: Read artifacts in order

1. `.graphify/GRAPH_REPORT.md`
2. `graphify summary` (cheaper and more focused than the HTML for agent work)
3. `.graphify/graph.html` (after `graphify export html`) for humans
4. `.graphify/graph.json` last, and prefer `graphify query --budget <n>` over pasting it

### Step 7: Route adjacent work outward

- `codebase-search` — exact text, symbol, config ownership, impact mapping before graphing
- `llm-wiki` — narrative synthesis, wiki pages, long-lived markdown knowledge bases
- `opencontext` — searchable decisions, manifests, stable links, project-memory handoff
- `survey` — tool/platform comparison before committing to Graphify

If the user asks "build or query the graph," stay here. If they ask "find the file fast," "file
this as a wiki note," or "store this as project memory," route out.

### Step 8: Return one concise graph brief

Packet · primary mode · commands actually run · scope · artifacts written · whether output was
degraded or fallback · 1–3 next commands · one route-out if the next step belongs elsewhere.

## Output format

Always return a **graph build brief**, **graph query brief**, **graph refresh brief**, **review
context brief**, or **Graphify install brief** with:

- the packet in hand and one primary mode
- the real commands run, with their scope
- which files under `.graphify/` exist or were created
- honest labeling of degraded, placeholder, or fallback output
- `GRAPH_REPORT.md` / `graphify summary` read before raw `graph.json`
- one route-out when neighboring work now owns the next step

## Examples

### Example 1: understand a repo before editing
**Input**
> Map this repo so I can understand the architecture before touching code.

**Good output direction**
- `repo-structure-packet`, mode `cli-build`
- `graphify scope` → `graphify update .` → `graphify summary`
- reports `.graphify/GRAPH_REPORT.md` and `.graphify/graph.json`, and that `graph.html` needs
  `graphify export html`

### Example 2: trace a relationship from an existing graph
**Input**
> We already have a graph. What connects the auth controller to billing?

**Good output direction**
- `relationship-trace-packet`, mode `cli-query`
- `graphify summary` → `graphify path <auth> <billing>` → `graphify explain <node>`
- no rebuild

### Example 3: review a diff
**Input**
> What does this PR actually touch? I want reviewer context, not a diff dump.

**Good output direction**
- `review-diff-packet`, mode `review-context`
- `graphify review-context --base main --detail-level standard` and
  `graphify affected-flows --base main --json`

### Example 4: install for our agents
**Input**
> Install graphify for jeo, jeopi, gjc and opencode.

**Good output direction**
- `install-packet`
- `pip install graphifyy`, then the skill into `~/.agents/skills` via `-a universal` for
  jeo/jeopi/gjc, plus optional `graphify install opencode`
- states plainly that `graphify install jeo` is not a valid platform id

### Example 5: request is really search
**Input**
> I just need to find where this config is defined and who references it.

**Good output direction**
- routes to `codebase-search`; does not build a graph

## Best practices
1. Lead with a real `graphify` command; never invent one — `graphify build` does not exist.
2. Write `.graphify/`, not `graphify-out/`; use `graphify migrate-state` for legacy repos.
3. Run `graphify scope` before an expensive build on an unfamiliar corpus.
4. Prefer `GRAPH_REPORT.md` and `graphify summary` over raw `graph.json`; cap traversals with
   `graphify query --budget <n>`.
5. Keep build, query, export, refresh, review, serve, install, and fallback as distinct modes.
6. Report placeholder `Community N` labels and missing descriptions as degraded output, not success.
7. Use `graphify hook install` or `graphify watch` for ongoing freshness instead of ad-hoc rebuilds.
8. Run `graphify portable-check` before committing `.graphify` artifacts.
9. Treat structural fallback as a first-class honest mode, not a hidden failure.
10. Route search-first work to `codebase-search`, narrative memory to `llm-wiki`, project memory
    to `opencontext`.
11. After a graphify wiki build — or any `pip install --upgrade graphifyy` — run
    `scripts/patch_wikilink.py` if `[[…]]` links look broken. graphify's generator emits
    raw-label `[[Community 36]]` links that never resolve to its slugged `Community_36.md` pages;
    the patcher normalizes every link site to `[[slug|label]]` and is idempotent. Wire it into
    the install/upgrade step (jeo: the `post-implementation` hook ahead of `graphify update .`)
    so the fix survives upgrades.

## References
- [CLI command map](references/cli-command-map.md) — every command and flag, grouped by job
- [Install matrix](references/install-matrix.md) — platform ids, jeo/jeopi/gjc/opencode routes
- [Mode packets and route-outs](references/mode-packets-and-route-outs.md)
- [Build and fallback recipes](references/build-and-fallback-recipes.md)
- [`scripts/patch_wikilink.py`](scripts/patch_wikilink.py) — idempotent wikilink-normalization patch (`--self-test`, `--check`)
- `../codebase-search/SKILL.md` · `../llm-wiki/SKILL.md` · `../opencontext/SKILL.md`
- Graphify upstream: https://github.com/Graphify-Labs/graphify
- Graphify PyPI: https://pypi.org/project/graphifyy/
