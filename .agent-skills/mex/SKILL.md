---
name: mex
description: >
  Drive mex (`mex-agent`), persistent project memory and code graphs for AI
  coding agents. One command scaffolds a living wiki, builds a deterministic
  code graph, and installs a project anchor file (CLAUDE.md, root AGENTS.md,
  .cursorrules, .windsurfrules, copilot-instructions.md, or
  .opencode/opencode.json) that your agent auto-loads as a standing rule
  document. Use when the user wants to `mex setup` a new project, build a
  symbol-grounded wiki, keep knowledge connected to implementation, route
  relevant context to agents, or run drift detection (`mex check`, `mex
  sync`). Triggers on: "mex setup", "project memory", "code graphs", "codebase
  documentation", "drift detection", "agent memory", "structured scaffolds",
  "architectural context", "living wiki", "project anchor file".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  Node.js >= 22.5. `npm install -g mex-agent` (MIT); binary is `mex`. Works
  standalone. An MCP package exists in the upstream monorepo
  (`packages/mex-mcp`) but is not published to npm as of this writing —
  build-from-source only, no `mex mcp` CLI subcommand ships in the released
  package. Supports TypeScript, JavaScript, Python, and Rust code analysis.
metadata:
  tags: mex, mex-agent, project-memory, code-graphs, drift-detection, documentation, agent-memory, living-wiki, tree-sitter, sqlite, cli, project-anchor
  platforms: Claude, ChatGPT, Gemini, Codex, Cursor, Windsurf, jeo, gjc, jeopi, OpenCode
  version: "1.1"
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
- Getting a project anchor file (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, ...)
  auto-generated so an agent picks up mex context as a standing rule, with no
  manual wiring
- Keeping architectural notes, decisions, and conventions synchronized with code
- Running drift detection (`mex check`) to catch stale documentation
- Syncing the wiki back to code after meaningful changes (`mex sync`)
- Retrieving compact, task-scoped context instead of a full-repo grep
  (`mex graph scope "<task>"`)
- Migrating an existing pre-0.7 project into graph grounding (`mex graph ground`)

## When not to use this skill

- The project has no meaningful history or architecture worth preserving as
  living documentation
- Documentation is generated purely from source comments (docstrings only, no
  structured memory needed)
- The user only wants an MCP server right now — mex's MCP package
  (`packages/mex-mcp`) is not published; do not promise MCP integration (see
  Compatibility above and Step 5 below)
- Real-time code inspection is more urgent than architectural context — mex
  complements, not replaces, LSP/IDE tools

## Instructions

### Step 1: One-shot auto-install (recommended)

```bash
bash .agent-skills/mex/scripts/install.sh /path/to/project
```

This is the fully automated path: it registers the skill, installs
`mex-agent` globally if `mex` is not already on `PATH`, verifies that `mex`
actually resolves to mex-agent (some machines already have a `mex` command —
see the compatibility note below — the script refuses to proceed rather than
silently running the wrong binary), runs `mex setup` non-interactively
(skipped if `.mex/` already exists — pass `--force` to re-run), builds the
code graph with `mex graph`, runs `mex check` for a health report, and prints
which project anchor file mex installed. It is idempotent and safe to re-run.
See `--help` for flags (`--mode agent-memory`, `--force`, `--skip-skill`,
`--tool <claude|cursor|windsurf|copilot|opencode|codex|multiple|none>`,
`GLOBAL=1`, `AGENTS=<list>`).

**Known collision:** machines with TeX Live installed (common via Homebrew on
macOS) already have a `mex` command — the pdfTeX Multilingual TeX format,
unrelated to this tool. `mex --version` disambiguates them: mex-agent prints
a bare semver (e.g. `0.7.1`); TeX Live's prints `pdfTeX ...`. `install.sh` and
`scripts/mex.sh doctor` both check this automatically.


### Step 2: What auto-install produces

`mex setup` scaffolds (verified against mex-agent 0.7.1; the README's own
diagram is slightly aspirational — it shows an `events/decisions.jsonl` that
does not exist until you actually run `mex log`):

```text
.mex/
|-- AGENTS.md          # small, always-loaded anchor (mirrors the root anchor)
|-- ROUTER.md          # maps task types to relevant wiki pages
|-- SETUP.md           # the "copy this into your agent" population prompt
|-- SYNC.md            # the drift-repair prompt used by `mex sync`
|-- config.json        # scaffold id, detected AI tool(s)
|-- graph.db           # the deterministic code graph (SQLite)
|-- context/
|   |-- architecture.md
|   |-- stack.md
|   |-- setup.md
|   |-- decisions.md
|   `-- conventions.md
`-- patterns/
    |-- INDEX.md
    `-- README.md
```

Every `context/*.md` and `patterns/*` file is an **empty template** at this
point — `mex setup` does not read your codebase and fill them in. It prints a
long prompt (bounded by "COPY ABOVE THIS LINE" banners) that you must paste
into your coding agent's chat; that agent session is what actually writes
project-specific content into the scaffold. `scripts/install.sh` detects the
banner and prints a warning so this step is never silently skipped.

One consequence of automating that prompt: mex's follow-up "Has population
finished?" grounding step is TTY-only (`confirmAndCaptureGrounding` bails when
stdin is not a TTY, verified in mex-agent 0.7.1), so driving `mex setup`
non-interactively skips grounding capture. Run `mex ground` once the agent has
populated the scaffold; `install.sh` prints this reminder.


It also writes a **project anchor file at the repository root**, chosen
interactively (mex asks "Which AI tool do you use?") — this is the "rule
document" the skill turns on automatically once you've answered that one
prompt (`install.sh` answers it for you via `--tool`, default `codex`):

| Tool | Project anchor mex writes |
|---|---|
| Claude Code | `CLAUDE.md` |
| Codex | `AGENTS.md` |
| Cursor | `.cursorrules` |
| Windsurf | `.windsurfrules` |
| GitHub Copilot | `.github/copilot-instructions.md` |
| OpenCode | `.opencode/opencode.json` |

jeo, gjc, and jeopi do not have a dedicated row in mex's own detection table,
but all three read a project's root `AGENTS.md` the same way Codex does — this
very repository's own `AGENTS.md`-driven skill instructions are loaded that
way. So `install.sh`'s default `--tool codex` gives jeo/gjc/jeopi their rule
document automatically. That covers the *anchor file* only; the wiki content
it points to (`.mex/context/*.md`, `.mex/patterns/*`) still needs the
paste-into-agent step from Step 2 above — there is no way to skip that and
still get real, project-specific content. Verify what actually exists with
`bash .agent-skills/mex/scripts/mex.sh doctor` (Step 6).


### Step 3: Populate ROUTER.md

Edit `.mex/ROUTER.md` to map common agent tasks to relevant wiki pages:

```markdown
# ROUTER.md

## Task: add a new API endpoint

Load:
- context/architecture.md
- context/conventions.md
- patterns/http-handlers.md

Don't load:
- context/decisions.md (unless the endpoint changes a prior decision)
```

### Step 4: Keep the graph and wiki current

```bash
mex graph          # rebuild the deterministic code graph after code changes
mex check          # validate paths, links, staleness, and grounded symbols
mex sync           # repair drift with targeted agent prompts
mex graph scope "<task description>"   # compact, task-relevant context
```

`mex check` never spends AI tokens — it is a mechanical validator. When it
finds drift, `mex sync` hands the agent a targeted diff instead of asking it
to rediscover the whole project.

### Step 5: MCP server — not published, do not promise it

`packages/mex-mcp` in the upstream monorepo exposes the wiki and event log as
MCP tools, but as of this writing **it is not published to npm** and ships no
`mex mcp` CLI subcommand in the released `mex-agent` package. The only way to
run it today is building from source inside a mex checkout:

```bash
git clone https://github.com/mex-memory/mex
cd mex && npm run build --workspace mex-mcp
```

Do not tell a user mex is "installed as an MCP server" for Claude Code,
Cursor, jeo, gjc, jeopi, or OpenCode — there is no supported registration
command yet. Check the MCP server section of the README
(https://github.com/mex-memory/mex#mcp-server) to track publication status
instead of fabricating a `mcp add` invocation.

### Step 6: Read-only environment check

```bash
bash .agent-skills/mex/scripts/mex.sh doctor [project_path]
bash .agent-skills/mex/scripts/mex.sh check <project_path> [extra mex check args...]
bash .agent-skills/mex/scripts/mex.sh graph <project_path> [extra mex graph args...]
```

`doctor` only inspects the environment (Node.js version, `mex` install, Git
repo, `.mex/` scaffold, and which project anchor file exists) — it never
installs packages or modifies project memory. `check`/`graph` are thin
pass-throughs to the real `mex` CLI so every invocation goes through one
place.

## Best practices

1. **Use `install.sh`, not manual steps** — it is idempotent (skips `mex
   setup` when `.mex/` already exists) and reports the anchor file mex chose,
   removing the copy/paste error surface of doing this by hand.
2. **ROUTER.md is the anchor** — an intelligent router prevents agents from
   loading the entire wiki. Keep task-to-context mappings short and specific.
3. **Ground claims to code** — use frontmatter `grounds_to` for architectural
   decisions so they stay tethered to exact symbol fingerprints.
4. **Check before sessions, sync after** — `mex check` detects staleness;
   `mex sync` gives agents compact context for repairs.
5. **Version the wiki** — `.mex/` is Markdown/JSONL; commit it to Git so you
   can track how memory evolved.
6. **Multi-language support** — mex handles TypeScript, JavaScript, Python, and
   Rust. If your project mixes languages, its code graph will too.
7. **Never claim MCP is wired up** — the MCP package is unpublished upstream;
   only document the build-from-source path in Step 5, and re-check the
   README before telling a user otherwise.
8. **Telemetry is opt-out, not opt-in** — mex sends anonymous command
   name/version/OS by default. Mention `DO_NOT_TRACK=1`, `MEX_TELEMETRY=0`, or
   `mex config set telemetry off` if the user cares.

## References

- [references/commands.md](references/commands.md) — curated command reference
  by workflow stage
- [scripts/install.sh](scripts/install.sh) — one-shot auto-installer
  (skill registration + `mex-agent` install + `mex setup`/`mex graph`/`mex check`)
- [scripts/mex.sh](scripts/mex.sh) — read-only doctor + thin `check`/`graph`
  wrappers
- [Mex GitHub Repository](https://github.com/mex-memory/mex)
- [Mex Docs](https://mexmemory.com)
- [Mex MCP server status](https://github.com/mex-memory/mex#mcp-server) —
  confirm publication status before promising MCP integration
- Project standards:
  `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: Auto-install and route agent context

```bash
bash .agent-skills/mex/scripts/install.sh ~/code/my-project
# Edit .mex/ROUTER.md to map your task types
```

The install prints which root anchor file was created (e.g. `AGENTS.md`), so
jeo/gjc/jeopi/Codex-style agents pick it up on their very next session in that
project, with no further setup.

### Example 2: Detect drift after an agent session

```bash
cd ~/code/my-project
mex check
# Reports stale paths, broken links, symbol changes
mex sync
# Generates a compact diff for the agent to review
```

### Example 3: Environment check before recommending mex to a project

```bash
bash .agent-skills/mex/scripts/mex.sh doctor /path/to/project
# Reports: Node.js version, mex install status, Git repo status,
# .mex/ scaffold presence, and which project anchor file exists
```

### Example 4: Re-run setup after moving to agent-memory mode

```bash
bash .agent-skills/mex/scripts/install.sh ~/code/my-homelab --mode agent-memory --force
# Adds HEARTBEAT.md conventions for long-running operational agents
```
