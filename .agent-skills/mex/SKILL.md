---
name: mex
description: >
  Drive mex (`mex-agent`), persistent project memory and code graphs for AI
  coding agents. Scaffold a living wiki, map your codebase, keep architectural
  context structured and up-to-date, and detect/repair drift between code and
  documentation. Use when the user wants to `mex setup` a new project, build a
  symbol-grounded wiki, keep knowledge connected to implementation, route
  relevant context to agents, or run drift detection (`mex check`, `mex sync`).
  Triggers on: "mex setup", "project memory", "code graphs", "codebase
  documentation", "drift detection", "agent memory", "structured scaffolds",
  "architectural context", "living wiki".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Node.js >= 22.5. `npm install -g mex-agent` (MIT). Works standalone or as an
  MCP server for Claude Code, Cursor, jeo, gjc, jeopi, and OpenCode. Supports
  TypeScript, JavaScript, Python, and Rust code analysis. Git repository
  required for full functionality.
metadata:
  tags: mex, mex-agent, project-memory, code-graphs, drift-detection, documentation, agent-memory, living-wiki, tree-sitter, sqlite, cli, mcp
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, jeo, gjc, jeopi, OpenCode
  version: "1.0"
  source: https://github.com/mex-memory/mex
---

# Mex — persistent project memory for AI coding agents

Mex maps your code, turns what agents learn into structured Markdown, and keeps
that knowledge connected to the implementation it describes. Every coding
session starts with relevant architectural context instead of another
full-repository scan.

## When to use this skill

- Setting up a new project scaffold for an AI-assisted codebase (`mex setup`)
- Building a symbol-grounded living wiki tied to exact source locations
- Establishing a ROUTER.md to guide agent context selection per task
- Keeping architectural notes, decisions, and conventions synchronized with code
- Running drift detection (`mex check`) to catch stale documentation
- Syncing the wiki back to code after meaningful changes (`mex sync`)
- Using mex as an MCP server to expose project memory to Claude Code or agents
- Migrating an existing project into a structured memory scaffold
- Grounding wiki claims to exact code graph nodes and fingerprints

## When not to use this skill

- The project has no Git repository or version history
- Documentation is generated purely from source comments (docstrings only, no
  structured memory needed)
- The user is only reading code (passive browsing); mex is best for
  bidirectional agent-code loops
- Real-time code inspection is more urgent than architectural context — mex
  complements, not replaces, LSP/IDE tools

## Instructions

### Step 1: Install mex

```bash
npm install -g mex-agent
mex --version
```

### Step 2: Initialize project memory

```bash
cd /path/to/project
mex setup
```

This scaffolds:
- `.mex/index.md` — always-loaded anchor file
- `.mex/ROUTER.md` — context routing rules per task type
- `.mex/graphs/` — deterministic code graph checksums
- `.mex/wiki/` — structured knowledge (architecture, conventions, decisions)

### Step 3: Populate the ROUTER.md

Edit `.mex/ROUTER.md` to map common agent tasks to relevant wiki pages:

```markdown
# ROUTER.md

## Task: add a new API endpoint

Load:
- architecture/api-layers.md
- conventions/naming.md
- patterns/http-handlers.md

Don't load:
- ui/components.md
- database/migrations.md (unless the endpoint touches schema)
```

### Step 4: Build the code graph once

```bash
mex update
```

This creates deterministic fingerprints for all symbols, so future drift checks
can detect if code changed (even in whitespace) without re-parsing.

### Step 5: Run drift detection

After an agent session:

```bash
mex check
```

Outputs:
- Stale paths (files moved/deleted)
- Broken links (wiki pages reference missing code)
- Symbol changes (fingerprints mismatch)
- Missing grounding (claims with no code reference)

### Step 6: Repair drift

```bash
mex sync
```

The agent can now use this targeted diff instead of re-learning the whole
project.

### Step 7: Use as an MCP server (optional)

```bash
mex mcp serve --port 3000
```

Then register with your agent:

```bash
# Claude Code
claude mcp add mex -- mex mcp serve

# Cursor, jeo, gjc, jeopi, OpenCode
<agent> mcp add mex -- mex mcp serve
```

### Step 8: Use the wrapper for a read-only environment check

```bash
bash .agent-skills/mex/scripts/mex.sh doctor
bash .agent-skills/mex/scripts/mex.sh check <project_path>
bash .agent-skills/mex/scripts/mex.sh update <project_path>
```

`doctor` only inspects the environment (Node.js version, `mex` install, Git
repo) — it never installs packages or modifies project memory.

## Best practices

1. **Scaffold early, sync often** — run `mex setup` before the first agent
   session, not after agents have drifted the codebase.
2. **ROUTER.md is the anchor** — an intelligent router prevents agents from
   loading the entire wiki. Keep task-to-context mappings short and specific.
3. **Ground claims to code** — use frontmatter `grounds_to` for architectural
   decisions so they stay tethered to exact symbol fingerprints.
4. **Check before sessions, sync after** — `mex check` detects staleness;
   `mex sync` gives agents compact context for repairs.
5. **Version the wiki** — `.mex/wiki/` is Markdown; commit it to Git so you can
   track how memory evolved.
6. **Multi-language support** — mex handles TypeScript, JavaScript, Python, and
   Rust. If your project mixes languages, its code graph will too.
7. **Symbol grounding prevents hallucination** — agents are less likely to
   invent APIs if wiki claims point to exact function nodes with fingerprints.

## References

- [references/commands.md](references/commands.md) — curated command reference
  by workflow stage
- [scripts/mex.sh](scripts/mex.sh) — read-only doctor + thin `check`/`update`
  wrappers
- [Mex GitHub Repository](https://github.com/mex-memory/mex)
- [Mex Docs](https://mexmemory.com)
- [COMPATIBILITY.md](https://github.com/mex-memory/mex/blob/main/COMPATIBILITY.md)
  — agent integration guide
- Project standards:
  `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Setup and route agent context

```bash
cd my-project
mex setup
# Edit .mex/ROUTER.md to map your task types
mex update
mex check     # verify readiness
```

Agent's first request now loads the router and picks relevant wiki pages
instead of re-scanning the whole repo.

### Example 2: Detect drift after an agent session

```bash
# After agent finishes
mex check
# Reports stale paths, broken links, symbol changes
mex sync
# Generates compact diff for the agent to review
```

### Example 3: Environment check before recommending mex to a project

```bash
bash .agent-skills/mex/scripts/mex.sh doctor /path/to/project
# Reports: Node.js version, mex install status, Git repo status
```
