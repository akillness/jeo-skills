---
name: semble
description: >
  Fast, accurate code search for AI agents using ~98% fewer tokens than grep+read.
  Indexes any local or remote repository in under a second (~250ms on CPU, no GPU or API key needed).
  Supports natural-language and symbol queries, semantic similar-code discovery, and MCP server
  integration for Claude Code, Codex, Cursor, and OpenCode. Python library available for programmatic
  use. Triggers on: semble, code search, semantic code search, semble search, token-efficient search,
  find code, code search mcp, agent code search, semble find-related, semble savings.
allowed-tools: Read Write Bash Grep Glob WebFetch
metadata:
  tags: semble, code-search, semantic-search, mcp, token-efficient, agent-tools, python, cli, codebase-navigation
  platforms: Claude Code, Codex CLI, Gemini CLI, OpenCode, Cursor
  keyword: semble
  version: latest
  source: MinishLab/semble
  license: MIT
---

# semble — Fast Token-Efficient Code Search for Agents

> ~98% fewer tokens than grep+read. Index in ~250ms. Query in ~1.5ms. No GPU, no API key.

Semble returns only the relevant code snippets agents need, without grepping full files or reading directories. A natural-language or symbol query like `"authentication flow"` or `"save_pretrained"` returns exact chunks with file paths and line ranges — nothing more.

## Installation

### MCP (Claude Code — recommended)
```bash
# Requires uv: https://docs.astral.sh/uv/getting-started/installation/
claude mcp add semble -s user -- uvx --from "semble[mcp]" semble
```

### MCP (Codex)
Add to `~/.codex/config.toml`:
```toml
[mcp_servers.semble]
command = "uvx"
args = ["--from", "semble[mcp]", "semble"]
```

### MCP (Cursor)
Add to `~/.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "semble": {
      "command": "uvx",
      "args": ["--from", "semble[mcp]", "semble"]
    }
  }
}
```

### MCP (OpenCode)
Add to `~/.opencode/config.json`:
```json
{
  "mcp": {
    "semble": {
      "type": "local",
      "command": ["uvx", "--from", "semble[mcp]", "semble"]
    }
  }
}
```

### CLI / pip
```bash
pip install semble        # pip
uv tool install semble    # uv (recommended for CLI use)
```

### Skill (any platform)
```bash
npx skills add https://github.com/akillness/oh-my-skills --skill semble
```

## When to use

- Search a codebase by describing behavior in natural language (`"how is rate limiting handled"`)
- Look up a symbol or identifier without knowing the exact file (`"save_pretrained"`)
- Discover code semantically similar to a known location (`find-related`)
- Give an agent token-efficient access to any repo via MCP instead of letting it grep/read full files
- Index a remote git repo without cloning first

## Do not use when

- You need to read a full file or directory listing → use native `Read`, `Glob` tools
- You need regex or exact-string search → `Grep` is more appropriate
- The repo is too small to justify indexing (a few files) — just read them directly
- You need to run tests, build, or execute code — this is a search-only tool

## CLI usage

```bash
# Natural-language search in a local repo
semble search "authentication flow" ./my-project

# Symbol search
semble search "save_pretrained" ./my-project

# Search with a limit on returned chunks
semble search "save model to disk" ./my-project --top-k 10

# Search a remote git repo (no clone needed)
semble search "save model to disk" https://github.com/MinishLab/model2vec

# Find semantically similar code given a known file+line
semble find-related src/auth.py 42 ./my-project

# Show token savings vs grep+read for the last query
semble savings
semble savings --verbose
```

## Python library

```python
from semble import SembleIndex

# Index local directory
index = SembleIndex.from_path("./my-project")

# Index remote repository (no clone required)
index = SembleIndex.from_git("https://github.com/MinishLab/model2vec")

# Natural-language or symbol query
results = index.search("save model to disk", top_k=3)

# Find semantically similar code to a known chunk
related = index.find_related(results[0], top_k=3)

# Inspect results
result = results[0]
print(result.chunk.file_path)   # "model2vec/model.py"
print(result.chunk.start_line)  # 127
print(result.chunk.end_line)    # 150
print(result.chunk.content)     # the function/class body
```

## AGENTS.md / CLAUDE.md integration

Add this section to your project's `AGENTS.md` or `CLAUDE.md` to enable semble for all agents:

```markdown
## Code Search

Use `semble search` to find code by describing what it does or naming a symbol, instead of grep:

​```bash
semble search "authentication flow" ./my-project
semble search "save_pretrained" ./my-project
semble search "save model to disk" ./my-project --top-k 10
​```

Use `semble find-related` to discover code similar to a known location (pass `file_path` and `line` from a prior search result):

​```bash
semble find-related src/auth.py 42 ./my-project
​```

`path` defaults to the current directory when omitted; git URLs are accepted.

If `semble` is not on `$PATH`, use `uvx --from "semble[mcp]" semble` in its place.
```

For Claude Code sub-agents, initialize once in the project root:
```bash
semble init
```

## Performance benchmarks

| Metric | Semble | grep+read |
|--------|--------|-----------|
| Indexing speed | ~250ms | n/a |
| Query speed | ~1.5ms | varies |
| Token use at 94% recall | ~2k tokens | ~100k tokens |
| NDCG@10 | 0.854 | — |
| vs 137M-param CodeRankEmbed | 99% quality | — |
| Indexing vs transformer | 218× faster | — |

## Operating rules

1. Prefer MCP installation for interactive agent use; prefer CLI/pip for scripting and CI.
2. Use `--top-k` to limit results and keep context small — default is often too generous for agent prompts.
3. Use `find-related` after `search` when you need to expand from one known chunk into similar code.
4. Use `semble init` in project roots to pre-warm the index for Claude Code sub-agents.
5. If `semble` is not on `$PATH`, replace with `uvx --from "semble[mcp]" semble` in scripts.
6. Treat semble as the first pass — read full files only when the returned chunk is insufficient context.

## Examples

```bash
# Search for how a feature is implemented
semble search "rate limiting middleware" ./api-service

# Find all code related to database migrations
semble search "database migration" ./backend --top-k 5

# Explore similar code patterns near a known function
semble find-related src/middleware/auth.py 88 ./api-service

# Index and query a remote library without cloning
semble search "tokenizer padding" https://github.com/huggingface/transformers
```

Source: [MinishLab/semble](https://github.com/MinishLab/semble) — MIT License
