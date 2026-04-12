# Graphify overview

Source: https://github.com/safishamsi/graphify

## Core idea
Graphify turns a codebase or mixed corpus into a persistent knowledge graph.

Primary outputs:
- `graphify-out/graph.html` — interactive graph
- `graphify-out/GRAPH_REPORT.md` — summary of god nodes, communities, and findings
- `graphify-out/graph.json` — persistent graph for later querying
- `graphify-out/cache/` — cache for incremental runs

## Supported input types
- Code
- Docs / markdown / text
- PDFs
- Office files via optional dependency
- Images
- Video / audio via optional dependency
- URLs via `graphify add`

## Notable workflow points
- Official PyPI package name is `graphifyy`
- CLI command is `graphify`
- Python 3.10+
- **Tested finding:** the current PyPI CLI help (v0.4.2) exposes install/query/memory-style commands, but does not expose a direct raw `graphify .` build command in the CLI entrypoint help. For Hermes/local automation, prefer the Python API pipeline unless you are using the assistant-native `/graphify` flow.
- Supports incremental updates with `--update` in assistant-native workflows; for Hermes/local automation, implement refreshes by re-running the Python pipeline on the changed scope.
- Supports graph queries with `query`, `path`, and `explain`
- Can install assistant-specific integrations for Claude, Codex, OpenCode, Cursor, Gemini, Copilot, Aider, OpenClaw, Factory Droid, and Trae

## Useful commands
```bash
graphify .
graphify ./raw --mode deep
graphify ./raw --update
graphify query "show the auth flow"
graphify path "DigestAuth" "Response"
graphify explain "SwinTransformer"
graphify add https://arxiv.org/abs/1706.03762
graphify ./raw --mcp
```
