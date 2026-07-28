# Graphify CLI Command Map

Every command and flag below was captured from the real `graphify --help` output of an
installed CLI (see the job groupings, not a feature tour). If a flag is not listed here,
check `graphify <command> --help` before using it — do not guess.

**State directory:** `.graphify/` in the folder you graphed. `graphify update` writes
`.graphify/graph.json` and `.graphify/GRAPH_REPORT.md`; `graphify export html` writes
`.graphify/graph.html`. Every `--graph <path>` flag defaults to `<cwd>/.graphify/graph.json`.

> There is **no `graphify build`** subcommand. `graphify build --help` silently falls through
> to the root help. The build command is `graphify update`.

---

## 1. Build and refresh

| Command | Job |
| --- | --- |
| `graphify update [path]` | One-shot code-only graph rebuild. This is the build command. |
| `graphify check-update [path]` | Report whether `.graphify` has pending semantic or lifecycle refresh signals. Cheap; run before rebuilding. |
| `graphify watch [path]` | Watch a folder and auto-rebuild on code changes. |
| `graphify extract <inputPath>` | Headless extraction for CI/scripts using AST plus optional semantic JSON or a direct LLM backend. |
| `graphify scope` | Inspect the resolved Graphify input scope before paying for a build. |
| `graphify label [path]` | Re-name communities with the configured LLM backend and regenerate the report. |
| `graphify describe [path]` | Generate `node.description` on an existing `graph.json` without re-extracting (non-destructive counterpart to `label`). |
| `graphify analyze [path]` | Rerun clustering/report/HTML on an existing `.graphify/graph.json`. |
| `graphify merge-graphs <graphs...>` | Merge two or more `graph.json` files into one cross-repo graph. |

Key `graphify update` flags:

- `--force` — overwrite `graph.json` even when the rebuild has fewer nodes
- `--no-cluster` — skip Louvain clustering and report regeneration
- `--no-description` / `--no-label` — skip per-node descriptions / community labels
- `--fill-missing` — only describe nodes whose description is empty (idempotent gap-fill)
- `--description-backend|--description-model|--description-mode <assistant|direct>`
- `--label-backend|--label-model|--label-mode <assistant|direct>`
- `--citation-cap <n|all>`, `--citations-top-k <n>`
- `--scope <auto|committed|tracked|all>`, `--all`

**Verified behavior:** with no LLM API key configured, `graphify update .` still completes and
writes `graph.json` + `GRAPH_REPORT.md`, but prints `community labeling failed ... using
Community N placeholders` and `description generation failed ... continuing without
descriptions`. Report that honestly instead of implying the graph is fully labeled. Re-run with
`graphify update --fill-missing` once a backend is configured.

## 2. Query and navigate

| Command | Job |
| --- | --- |
| `graphify summary [graph]` | Compact first-hop orientation — hubs, communities, representative nodes. Best first read after `GRAPH_REPORT.md`. |
| `graphify query <question>` | BFS (or `--dfs`) traversal of `graph.json` for a question. |
| `graphify explain <node>` | Plain-language details for one node. |
| `graphify path <source> <target>` | Shortest path between two nodes. |
| `graphify tree <node>` | Compact tree view from one node. |

Flags worth knowing:

- `graphify summary --top-hubs <n> --top-communities <n> --nodes-per-community <n>` (defaults 5/5/3)
- `graphify query --budget <n>` caps output at N tokens (default 2000) — use it instead of
  pasting `graph.json` into a prompt
- `graphify tree --depth <n> --max-children <n>` (defaults 2/12)
- all of them accept `--graph <path>`

## 3. Export

`graphify export <format>` turns an existing graph into an artifact:

`html` · `wiki` · `obsidian` · `svg` · `graphml` · `neo4j` · `spanner` (file-only DDL/DML)

`graphify wiki describe` generates wiki description sidecars for nodes and communities.

**Verified:** `graphify export html` prints `graph.html written - open in any browser:
<cwd>/.graphify/graph.html`. `graph.html` is **not** produced by `graphify update` alone.

## 4. Keep it fresh automatically

| Command | Job |
| --- | --- |
| `graphify watch [path] --debounce <seconds>` | Foreground auto-rebuild loop (default debounce 3s). |
| `graphify hook install` | Install `post-commit` / `post-checkout` / `post-merge` / `post-rewrite` git hooks. |
| `graphify hook status` / `graphify hook uninstall` | Check / remove those hooks. |

## 5. Change-aware review (CI and PR work)

| Command | Job |
| --- | --- |
| `graphify affected-flows [files...]` | Find execution flows affected by changed files (`--flows`, `--base`, `--head`, `--staged`, `--files <csv>`, `--json`). |
| `graphify review-context [files...]` | Focused CRG-style review context (`--detail-level minimal\|standard`, `--include-source`, `--max-depth`, `--max-lines-per-file`, `--json`). |
| `graphify detect-changes [files...]` | CRG-style line-aware risk scoring for changed files. |
| `graphify flows` | Execution flow analysis derived from graph `CALLS` edges. |
| `graphify portable-check [path]` | Fail if commit-safe `.graphify` artifacts contain absolute or escaped paths. Run before committing `.graphify`. |
| `graphify agent-stats` | Per-agent stats from agentic CLI transcripts (evidence-based attribution, not git authorship). |
| `graphify pr` / `graphify prs [selector]` | Inspect local GitHub pull requests through `gh` and git worktree data. |

## 6. Serve the graph to an agent

`graphify serve [graph]` starts a **stdio MCP server** for `graph.json`. There is no
`graphify mcp` subcommand — `graphify mcp --help` falls through to the root help.

## 7. Ingest external material

| Command | Job |
| --- | --- |
| `graphify add <url>` | Fetch a URL into `./raw` (`--dir`, `--author`, `--contributor`) for the next graph update. |
| `graphify clone <url>` | Clone a repository locally and print its resolved path (`--branch`, `--out`). |

## 8. State and migration

| Command | Job |
| --- | --- |
| `graphify state status` | Print branch/worktree lifecycle metadata. |
| `graphify state prune` | Plan stale lifecycle cleanup **without** deleting files. |
| `graphify migrate-state` | Migrate legacy `graphify-out/` state into `.graphify`. |
| `graphify uninstall` | Remove graphify from all detected platform integrations. |

`graphify-out/` is the **legacy** layout. If a repo still has it, run `graphify migrate-state`
rather than writing new instructions against the old directory.

## Minimal CLI session

```bash
pip install graphifyy          # PyPI package is graphifyy; the CLI is graphify
graphify update .              # -> .graphify/graph.json + .graphify/GRAPH_REPORT.md
graphify summary               # orientation: hubs, communities, representative nodes
graphify query "what validates the catalog?" --budget 1500
graphify explain validate_manifest
graphify path validate_manifest validate_readme
graphify export html           # -> .graphify/graph.html
```
