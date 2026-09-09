---
name: zvec-grep
description: >
  Drive zvec-grep (`zg`), zvec-ai's local-first workspace search CLI and MCP
  server, to index code and documents, run hybrid, vector, BM25, or exhaustive
  managed ripgrep searches, configure agent integrations, and diagnose index or
  server freshness. Use when a task needs local workspace-grounded retrieval
  across code, Markdown, text, structured data, or images. Triggers on:
  zvec-grep, zvec grep, `zg`, @zvec/zvec-grep, local-first workspace search,
  hybrid workspace search, semantic repository search, zvec MCP, zvec_grep_search,
  managed ripgrep, `.zvec-grep`, or Remote Embedding authorization.
allowed-tools: Bash Read Write Edit Glob Grep WebFetch
compatibility: Requires Node.js 22 or newer for the current @zvec/zvec-grep package; native zvec runtime support depends on the host platform.
metadata:
  tags: zvec-grep, zvec, workspace-search, hybrid-search, semantic-search, bm25, ripgrep, mcp, cli, local-first, embeddings, node
  platforms: Claude Code, Codex CLI, Qwen Code, Qoder, OpenCode, Cursor
  keyword: zvec-grep
  version: "0.2.2"
  source: https://github.com/zvec-ai/zvec-grep
  license: Apache-2.0
---

# zvec-grep - local-first workspace search for humans and agents

zvec-grep, invoked as `zg`, is a Node CLI and local MCP server. It combines
ranked lexical retrieval, vector retrieval, and managed ripgrep over one scoped
workspace. It is a search tool, not a general web search engine, a production
search backend, or a durable project-memory store.

## When to use this skill

- The user wants to install, update, configure, or operate `@zvec/zvec-grep`.
- An agent needs local evidence from a repository or mixed workspace and the
  wording or location is unknown.
- The task needs a choice between indexed hybrid or semantic retrieval and
  exhaustive exact or regex matching through `zg query --rg`.
- A workspace index, local MCP daemon, agent integration, refresh state, model
  choice, or Remote Embedding authorization needs diagnosis.
- The user asks about `zvec_grep_search`, the optional full MCP toolset, or the
  `zg install` integration targets.

## When not to use this skill

- Exact symbol, quotation, filename, or regex lookup in a small local tree:
  use native `rg` or the repository's normal code-navigation workflow.
- Token-efficient code-only search, remote git indexing, or `find-related`:
  route to `semble` when that is the installed and intended tool.
- Graph construction, call-graph or relationship artifacts: route to `graphify`.
- Durable project memory or handoff notes: route to `opencontext`.
- Web pages, crawling, or current external facts: route to `scrapling`, a browser,
  or the appropriate web source. `zg` only searches local workspace evidence.
- A hosted application search backend, faceting, or production serving layer:
  route to `typesense` or the application's search owner.

## Instructions

### 1. Verify the current runtime before copying commands

The published npm package `@zvec/zvec-grep@0.2.2` uses subcommands.
Confirm version-specific details with the installed binary before copying commands:

```bash
node --version                 # published package requires Node.js >= 22
zg version
zg help
zg help query
zg help models
zg help file-types
```

Use `zg query`, `zg index`, `zg status`, `zg install`, and `zg server`.
Do not copy long action flags such as `zg --index` from the moving GitHub `main`
docs into a setup that installs npm 0.2.2. If the binary is absent, do not
silently install it; show the pinned package install command and wait for the
requested install action:

```bash
npm install -g @zvec/zvec-grep@0.2.2
```

### 2. Classify the retrieval route before running it

Use one route for the first probe:

| Need | Route | Side effect |
| --- | --- | --- |
| Known exact word, path, quote, key, filename, regex, or every occurrence | native `rg` or `zg query --rg` | no index required |
| Unknown location, conceptual relation, chronology, causality, or cross-file synthesis | `zg query <query>`, `zg query --fts`, or `zg query --vector` | may create or refresh an index |
| Known exact anchor plus surrounding meaning | indexed `zg` first, then native `rg` | index plus focused exact read |
| Current external or web content | web source, not `zg` | outside this skill |

For an indexed task, make at most one focused semantic probe, cap results with
`--limit`, and follow a promising hit with exact `rg` or a file read. Do not use
vector retrieval for exhaustive occurrence claims.

### 3. Scope the workspace before indexing

The normal index lives at `<workspace>/.zvec-grep/`. For a large or sensitive
repository, choose the root and file scope explicitly before the first index:

```bash
cd /absolute/path/to/repository
zg index \
  --embedding local/potion-code-16m-v2 \
  -g 'src/**' \
  -g 'docs/**' \
  -g '!dist/**' \
  -t ts
zg status --check-ready
```

The scanner already excludes `.git`, `.zvec-grep`, common generated or binary
paths, and repository ignore rules. It can index code, Markdown, text, JSON,
YAML, TOML, CSV, XML, HTML, and selected images. PDFs, office files, archives,
executables, databases, and oversized or binary files are skipped. Use
`--debug` when skipped-file counts or extraction failures matter.

A positional query with no index can create one using a local embedding model.
That is convenient for an explicitly approved small workspace, but it is not a
permission to create persistent state silently in an agent workflow. Prefer an
explicit `zg index` step when the root, model, or file scope matters.

### 4. Reuse and maintain the index deliberately

```bash
zg status
zg status --check-ready
zg index                       # incremental update with stored schema
zg index --rebuild \
  --embedding local/jina-embeddings-v2-base-code
zg index --drop --yes          # destructive; never run implicitly
```

Existing indexes keep their stored model, dimensions, endpoint, and path policy.
Changing the embedding model or endpoint requires an explicit rebuild. Treat
`.zvec-grep/` as generated local state: keep it out of commits and backups by
default, and do not delete it merely because a repository has a stale result.
Inspect status and decide whether to refresh, rebuild, or narrow paths.

### 5. Choose execution mode and server lifecycle

Use `auto` for ordinary terminal use, `server` when a ready daemon is required,
and `direct` for one-off, CI, or foreground debugging:

```bash
zg query "where authentication is validated" --mode auto
zg query "where authentication is validated" --mode direct
zg status --mode server --check-ready
zg server status --check-ready
zg server on
zg server off
```

The default MCP endpoint is loopback-only at `http://127.0.0.1:7999/mcp`. The
server is not required for `zg query --rg`. Configure stdio only through
`zg install --mcp-transport stdio` for a supported agent, and do not expose
the MCP server on a non-loopback address.

The default `agent` MCP toolset exposes indexed `zvec_grep_search`. The optional
`full` toolset adds managed rg and administrative index/status tools. An agent
must never silently create, rebuild, or drop a persistent index through the full
MCP surface.

### 6. Configure agent integrations without clobbering existing settings

Install only the requested target and restart the agent afterward:

```bash
zg install --target claude --yes
zg install --target codex --yes
zg install --target opencode --yes
zg install --target cursor --yes
zg install --target qwen --yes
zg install --target qoder --yes
```

`qoder` configures Qoder CLI and Qoder IDE together. The installer writes
marked managed blocks and preserves unrelated settings. If it finds an
unmanaged `zvec_grep` entry, inspect it before using `--force`:

```bash
zg install --target claude --force --yes
```

Do not claim the integration is ready until the server is ready and a new agent
session exposes the expected tool name. See `references/agent-integrations.md`.

### 7. Treat Remote Embedding as a separate data authorization

Local models keep workspace content and query text on the machine. Remote models
send disclosed query or workspace content to the configured provider after
explicit authorization. Credentials and data authorization are separate:

```bash
zg config provider set qwen --api-key "$DASHSCOPE_API_KEY"
zg config model set qwen/text-embedding-v4 --default
zg index --embedding qwen/text-embedding-v4 --allow-remote
```

For a persistent workspace grant, use the explicit auth flow only after the user
has approved the provider, endpoint, scope, and data boundary:

```bash
zg auth grant \
  --capability embedding \
  --scope workspace \
  --embedding qwen/text-embedding-v4
zg auth status
zg auth revoke
```

Never print, request, or store API keys or server tokens in a report. Never grant
remote access automatically because an MCP tool was approved. In a headless
session, stop rather than inventing consent.

### 8. Diagnose from the real state, not a green-looking command

Use the smallest read-only check first:

```bash
zg status --mode direct --debug
zg server status --check-ready
zg help environment
```

Then separate the failure layer: missing binary or Node runtime, invalid command
shape, absent or stale index, model download/runtime failure, server readiness,
agent configuration, or remote authorization. The default daemon log is
`~/.zvec-grep/daemon/logs/server.log`; read it only after status points there and
keep credentials, tokens, raw queries, and workspace paths out of the report.

The upstream project is active and its GitHub `main` can differ from the
published npm package. For this skill, installed `zg help` and the pinned npm
0.2.2 package docs are the command truth.

### 9. Contribute only after separating product use from repository work

For work on the zvec-grep source repository itself, read its contributor guide
and current source first. Keep the user-facing skill focused on operation. Do
not copy the upstream repository into this catalog, vendor its `dist`, native
bindings, models, benchmarks, or generated assets, and do not treat benchmark
claims as guarantees for the user's repository.

## Best practices

1. Prefer an explicit scope and local model before indexing a large or sensitive
   workspace.
2. Use `zg query --rg` or native `rg` for exact and exhaustive evidence; use semantic
   retrieval for discovery, not proof of absence.
3. Keep index creation, rebuild, drop, server startup, agent configuration, and
   Remote Embedding grants explicit and user-visible.
4. Recheck `zg status --check-ready` and the target agent session after setup;
   an installed config is not the same as a working integration.
5. Keep `.zvec-grep/` local and generated unless the user explicitly asks to
   preserve or inspect it.
6. Report the selected root, route, model class, freshness, and scope, but not
   secrets, raw query content, or unnecessary personal paths.
7. Pin examples to the installed CLI help and do not mix outdated command-shaped
   README examples with current long-option commands.

## Examples

### Local code investigation

```bash
cd /path/to/repo
zg index --embedding local/potion-code-16m-v2 -g 'src/**' -t ts
zg query --vector "where credentials are validated" --limit 5
rg -n -F 'ForbiddenError' src
```

### Exact search without an index

```bash
zg query --rg -n -F 'ZVEC_GREP_EMBEDDING' -g '*.md' .
```

### Agent integration

```bash
zg install --target claude --yes
zg server status --check-ready
# Restart Claude Code, then confirm zvec_grep_search is visible.
```

### Remote embedding with explicit approval

```bash
zg index \
  --embedding qwen/text-embedding-v4 \
  --api-key "$DASHSCOPE_API_KEY" \
  --allow-remote \
  -g 'docs/**'
```

### Route an adjacent request

- "Find every `TODO` in this tree" -> `zg query --rg` or native `rg`, not vector search.
- "Map the dependency graph" -> `graphify`.
- "Find a code symbol with minimal context" -> `semble`.
- "Scrape the latest web page" -> `scrapling` or the web-fetch route.

## References

- Upstream repository at audited commit `6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3`: <https://github.com/zvec-ai/zvec-grep/tree/6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3>
- Current CLI contract: <https://github.com/zvec-ai/zvec-grep/blob/6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3/docs/02-cli.md>
- Agent integrations: <https://github.com/zvec-ai/zvec-grep/blob/6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3/docs/01-agents.md>
- MCP contract: <https://github.com/zvec-ai/zvec-grep/blob/6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3/docs/03-mcp.md>
- Privacy and model authorization: <https://github.com/zvec-ai/zvec-grep/blob/6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3/docs/07-embedding.md>
- Apache License 2.0: <https://github.com/zvec-ai/zvec-grep/blob/6fa85a8e28c0b5a0f651c27f09f0247627c5d5c3/LICENSE>
- npm package: <https://www.npmjs.com/package/@zvec/zvec-grep>
