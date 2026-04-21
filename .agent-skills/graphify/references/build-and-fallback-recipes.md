# Build and Fallback Recipes

Use these recipes after choosing the mode. Keep the front door in `SKILL.md` small; keep the mechanical detail here.

## Core runtime facts
- Official PyPI package name: `graphifyy`
- CLI command: `graphify`
- Python requirement: 3.10+
- Assistant-native installs exist for Claude, Codex, Gemini, OpenCode, Cursor, Copilot, Aider, and related tools
- Local automation may still need a Python/API or structural-fallback path even when assistant installs exist upstream

## `assistant-native-install`
Use when the user wants Graphify to be available inside the assistant rather than as a one-off local build.

Typical commands:
```bash
graphify install
graphify claude install
graphify codex install
graphify gemini install
graphify opencode install
```

Checklist:
1. verify `graphify --help`
2. confirm the target assistant/runtime exists
3. install only the assistant integration actually needed
4. tell the user how to invoke `/graphify` or the equivalent next step

## `local-python-build`
Use when the environment needs a truthful non-native path.

Typical runtime prep:
```bash
python3 -m pip install graphifyy
graphify --help
```

Guidance:
- prefer the smallest useful subtree first
- preserve the durable artifact contract: `graphify-out/GRAPH_REPORT.md`, `graphify-out/graph.json`, `graphify-out/graph.html`
- if the raw CLI/build surface does not honestly support the needed workflow in the current environment, switch to the tested local/Python path instead of faking parity with assistant-native UX

## `incremental-refresh`
Use when artifacts already exist and the user changed only part of the corpus.

Guidance:
- inspect current `graphify-out/`
- refresh only the changed scope when practical
- preserve or regenerate the same artifact set
- tell the user whether the run was a full rebuild or a refresh of existing outputs

## `graph-query-followup`
Use when the graph exists and the job is now question answering.

Read in this order:
1. `GRAPH_REPORT.md`
2. `graph.html`
3. `graph.json`

Typical follow-up commands:
```bash
graphify query "show the auth flow"
graphify path "AuthModule" "Database"
graphify explain "BillingPipeline"
```

Rule: prefer one focused query over an unnecessary rebuild.

## `structural-fallback`
Use when native extraction is unavailable, returns a 0-node graph, or would be misleading for a markdown-heavy corpus.

Good fallback signals:
- filesystem structure
- frontmatter metadata
- support-folder presence (`references/`, `evals/`, `scripts/`, compact variants)
- explicit cross-file mentions or index references
- repo discovery docs that already list the relevant nodes

Fallback output rule:
- still write the normal durable artifact names when possible
- label the result as a **graphify-style structural fallback**, not a native semantic graph build
- explain why the fallback was chosen

## Common failure patterns
- **Package/command confusion**: `graphifyy` is the package, `graphify` is the CLI
- **Large noisy repo**: shrink the scope or add ignores before retrying
- **Markdown-heavy corpus**: choose structural fallback sooner
- **Machine-specific artifact leakage**: tell the user if output paths or caches are local-machine specific
- **Search-only request**: route to `codebase-search` instead of forcing a graph

## Neighboring ownership reminder
- `codebase-search` owns fast locate/reference/config impact work
- `llm-wiki` owns markdown knowledge-base synthesis and filing
- `opencontext` owns searchable project memory and cross-agent handoff
