---
name: graphify
description: >
  Turn a codebase or mixed corpus (code, docs, PDFs, images, audio, video) into a
  persistent knowledge graph with HTML visualization, graph.json, and GRAPH_REPORT.md.
  Use when the user wants faster codebase understanding, architecture discovery,
  graph-based corpus analysis, GraphRAG-style context, relationship tracing, or
  graph querying across raw project files. Triggers on: graphify, knowledge graph,
  codebase graph, architecture graph, graph.json, GRAPH_REPORT, understand this repo,
  map this codebase, query the graph, shortest path between concepts, or turn raw
  files into a graph.
allowed-tools: Bash Read Write Grep Glob
compatibility: Requires Python 3.10+ and graphify installation via the official PyPI package `graphifyy`.
metadata:
  tags: knowledge-graph, codebase-analysis, graphrag, architecture, graphify, corpus-analysis
  version: "1.0"
  source: safishamsi/graphify
---

# Graphify

## When to use this skill

- The user wants to understand a new codebase before editing it
- The user wants a structure-first map of a project instead of manual grep/search
- The corpus mixes code, docs, PDFs, screenshots, notes, or media and needs one connected view
- The user wants `graph.json`, `GRAPH_REPORT.md`, or graph-based querying/path tracing
- The user wants to build a persistent knowledge graph that survives across sessions
- The user mentions GraphRAG-style context, code relationship mapping, or community detection

## Instructions

### Step 1: Install or verify graphify

Use the **official** PyPI package name:

```bash
python3 -m pip install graphifyy
```

Verify the CLI:

```bash
graphify --help
```

Important:
- The package name is `graphifyy`
- The CLI command is `graphify`
- Python 3.10+ is required

Optional extras depending on use case:

```bash
python3 -m pip install 'graphifyy[pdf]'
python3 -m pip install 'graphifyy[video]'
python3 -m pip install 'graphifyy[office]'
python3 -m pip install 'graphifyy[neo4j]'
python3 -m pip install 'graphifyy[mcp]'
python3 -m pip install 'graphifyy[all]'
```

### Step 2: Choose the right input scope

Default to the smallest folder that answers the question.

Examples:
- whole repo for architecture understanding
- `src/` or `app/` for implementation relationships
- a `raw/` or notes folder for research corpora
- a mixed media folder for multimodal graph building

If the codebase is huge, prefer a subfolder first instead of graphing everything blindly.

### Step 3: Pick the correct execution mode

There are **two different Graphify workflows** to know about:

1. **Assistant skill workflow** — the repo's intended UX. Install graphify into a supported coding assistant and trigger `/graphify` there.
2. **Python API workflow** — use the underlying Python modules directly when you need to test or automate graph generation outside the assistant UX.

Important tested note:
- The current PyPI CLI (`graphifyy` v0.4.2) exposes commands like `install`, `query`, `save-result`, `benchmark`, and platform install hooks.
- It does **not** expose a direct `graphify .` build command in the raw CLI help we tested.
- So for Hermes/local automation, prefer the Python API workflow unless you are explicitly configuring the assistant-side `/graphify` skill.

### Step 4: Build the graph via Python API when running locally

Minimal tested pipeline pattern:

```python
from pathlib import Path
from graphify.detect import detect
from graphify.extract import extract
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.analyze import god_nodes, surprising_connections, suggest_questions
from graphify.report import generate
from graphify.export import to_json, to_html
```

Typical automation flow:
- run `detect()` on the target corpus
- extract code structure with `extract()`
- build the graph with `build_from_json()`
- cluster with `cluster()`
- score with `score_all()`
- generate a report with `generate()`
- export `graph.json` and `graph.html`

Expected outputs:

```text
graphify-out/
├── graph.html
├── GRAPH_REPORT.md
├── graph.json
└── cache/
```

### Step 5: Use the assistant install flow when the user wants always-on behavior

Platform-specific install examples:

```bash
graphify install
graphify claude install
graphify codex install
graphify opencode install
graphify cursor install
graphify gemini install
graphify copilot install
graphify aider install
graphify claw install
```

Use these when the user wants their coding assistant to consult the graph automatically.

### Step 6: Read the outputs in the right order

Use this sequence:

1. `graphify-out/GRAPH_REPORT.md` — high-level architecture and community overview
2. `graphify-out/graph.html` — interactive exploration
3. `graphify-out/graph.json` — structured persistence and downstream querying

Do **not** dump the full `graph.json` into an LLM prompt if you can avoid it.
Start from `GRAPH_REPORT.md`, then use focused graph queries.

### Step 7: Query the graph instead of re-reading raw files

Examples:

```bash
graphify query "show the auth flow"
graphify query "what connects attention to the optimizer?"
graphify query "what connects attention to the optimizer?" --dfs
graphify query "what is CfgNode?" --budget 500
graphify path "DigestAuth" "Response"
graphify explain "SwinTransformer"
```

Use query/path/explain when:
- the user asks for a relationship between concepts
- the user wants the shortest path between components
- the user wants a plain-language explanation from graph structure
- the user wants graph-backed context for an LLM answer

### Step 8: Use incremental updates on changing corpora

If files have changed and an existing graph already exists, prefer an incremental refresh strategy instead of a full rebuild.

In assistant-native Graphify environments this may be exposed as an update mode.
In Hermes/local automation, implement this by re-running the Python pipeline on the changed scope and reusing existing graph artifacts when practical.

### Step 9: Add external sources to the corpus

Graphify can ingest URLs into the corpus:

```bash
graphify add https://arxiv.org/abs/1706.03762
graphify add https://x.com/karpathy/status/...
graphify add <video-url>
graphify add https://... --author "Name"
graphify add https://... --contributor "Name"
```

Use this when building a living research graph, not just a code graph.

## Output format

When reporting back after running graphify, include:

- input path used
- output directory
- whether graph build succeeded
- which artifacts were created (`GRAPH_REPORT.md`, `graph.html`, `graph.json`, etc.)
- the most important structural findings from `GRAPH_REPORT.md`
- whether incremental/update mode or special export modes were used

## Examples

### Example 1: Understand a new repo

Use the Python API pipeline to build `GRAPH_REPORT.md`, `graph.html`, and `graph.json`, then read:
- `graphify-out/GRAPH_REPORT.md`
- `graphify-out/graph.html`

### Example 2: Trace an architecture relationship

```bash
graphify query "show the auth flow" --graph graphify-out/graph.json
graphify path "AuthModule" "Database"
```

### Example 3: Keep a graph fresh during active development

Re-run the pipeline on the changed scope and preserve/export updated `graph.json` and `GRAPH_REPORT.md` so later queries use fresh structure.

## Best practices

1. Use the official package `graphifyy`, not similarly named PyPI packages
2. Start with `GRAPH_REPORT.md` before querying raw graph data
3. Prefer focused subfolders for very large repos
4. Use `--update` for repeated runs on evolving codebases
5. Use `query`, `path`, and `explain` for precise follow-up questions
6. Add `.graphifyignore` to exclude noisy folders like `node_modules/`, `dist/`, or generated files
7. Use optional extras only when needed to keep installs lighter

## References

- GitHub: https://github.com/safishamsi/graphify
- Official package: https://pypi.org/project/graphifyy/
