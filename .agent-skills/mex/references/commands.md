# Mex command reference

All commands run from the project root. Prefer the unambiguous `mex-agent`
wrapper installed by this skill; use `npx mex-agent` when no wrapper is
available. Use bare `mex` only after its version prints a mex-agent semantic
version. Verified against mex-agent 0.7.1 `--help` and the upstream README
(https://github.com/mex-memory/mex#core-commands) — the README's own "Core
commands" table is incomplete relative to the installed CLI (it omits `init`,
`pattern`, `watch`, `doctor`, `feedback`, `config`, `telemetry`); this file
follows `--help` output where the two disagree. Do not add commands that
neither source documents.

## Known issue: `mex` name collision

On machines with TeX Live installed (common via Homebrew on macOS), `mex` is
already a command — the pdfTeX-based Multilingual TeX format, unrelated to
this tool. `command -v mex` alone cannot tell them apart; check the version
string:

```bash
mex --version
# real mex-agent prints a bare semver, e.g. "0.7.1"
# TeX Live's mex prints "pdfTeX 3.141592653-2.6-1.40.27 (TeX Live ...)"
```

If PATH resolves bare `mex` to the wrong tool, use `mex-agent <command>` or
`npx mex-agent <command>` instead. For a nonstandard install, set
`MEX_AGENT_BIN=/absolute/path/to/mex-agent`. `scripts/install.sh` creates the
unambiguous `~/.local/bin/mex-agent` wrapper when needed, and both installer
and helper resolve it before considering bare `mex`. `doctor` still reports
the collision so stale docs or scripts using bare `mex` remain visible.

## Install

```bash
npm install -g mex-agent      # installs the upstream package
mex-agent --version           # unambiguous wrapper installed by this skill
npx mex-agent setup           # fallback without the wrapper
```

## One-shot auto-install (this skill)

```bash
bash .agent-skills/mex/scripts/install.sh /path/to/project
bash .agent-skills/mex/scripts/install.sh /path/to/project --mode agent-memory
bash .agent-skills/mex/scripts/install.sh /path/to/project --force
bash .agent-skills/mex/scripts/install.sh /path/to/project --tool claude
bash .agent-skills/mex/scripts/install.sh --skip-skill /path/to/project
GLOBAL=1 bash .agent-skills/mex/scripts/install.sh -g /path/to/project
```

Registers the jeo-skills plugin, resolves or installs `mex-agent`, creates an
unambiguous wrapper when needed, and runs `mex-agent setup` non-interactively by
piping the `--tool` choice into its prompts. Setup is skipped unless `.mex/`
is absent or `--force` is given, but the default `codex`/`multiple` path still
ensures a root `AGENTS.md` bridge for jeo/gjc/jeopi. It then builds the code
graph, runs `mex-agent check`, and reports every project anchor found.

## Setup and scaffolding

```bash
mex-agent setup                       # create .mex/ scaffold + project anchor file
mex-agent setup --mode agent-memory   # add HEARTBEAT.md conventions for long-running
                                       # operational agents (homelabs, infra workspaces)
mex-agent                              # open the interactive terminal dashboard
mex-agent tui                          # same dashboard, without the TeX collision
```

`mex-agent setup` is interactive (it asks which tool anchor to write, then whether
to install mex globally) and only creates EMPTY scaffold files plus the
anchor. It does **not** auto-populate `.mex/context/*.md` or `.mex/patterns/`
— it prints a long prompt bounded by "COPY ABOVE THIS LINE" banners that a
human must paste into their coding agent's chat; that agent session is what
actually writes the project-specific wiki content. `scripts/install.sh`
detects this banner and warns so the step isn't silently skipped.

## Pre-analysis and diagnostics

```bash
mex-agent init            # scan the codebase and print a pre-analysis brief for AI
mex-agent init --json      # same, as JSON
mex-agent doctor           # mex's own scaffold health diagnostic (not this skill's
                       # scripts/mex.sh doctor, which only checks the environment)
```

## Code graph (deterministic, Tree-sitter + SQLite)

```bash
mex-agent graph                                  # build or refresh the local code graph
mex-agent graph scope "trace the auth flow"      # compact, task-relevant context
mex-agent graph get <node-id...>                 # expand exact symbols from a scope result
mex-agent graph query where-defined <symbol>     # structural relationship queries
mex-agent graph query who-calls <symbol>
mex-agent graph query what-calls <symbol>
mex-agent graph ground                           # connect a pre-0.7 wiki to the graph
```

Supports TypeScript, TSX, JavaScript, JSX, Python, and Rust, including
framework-aware Express route-to-handler relationships. Agent-facing graph
commands emit deterministic JSONL envelopes.

## Drift detection and repair

```bash
mex-agent check     # validate paths, commands, deps, links, indexes, staleness,
                    # tool config, and grounded code symbols — no AI tokens spent
mex-agent sync      # repair stale/inconsistent knowledge with targeted agent prompts
mex-agent impact <symbol|file>   # find code and wiki content affected by a change
```

## Project memory bookkeeping

```bash
mex-agent log "<message>"   # record a decision, note, risk, or todo
mex-agent timeline           # read recent project events
mex-agent heartbeat          # run persistent-agent health checks (agent-memory mode)
mex-agent pattern add <name>   # create a new pattern file and add it to the index
mex-agent watch --interval [minutes]   # run heartbeat repeatedly instead of a hook
mex-agent watch                          # install a post-commit hook
mex-agent watch --uninstall               # remove the post-commit hook
```

## Utility

```bash
mex-agent completion <shell>   # print shell completions
mex-agent commands              # list every command and script
mex-agent config set telemetry off
mex-agent telemetry inspect
mex-agent feedback               # open the mex feedback form
```

## Telemetry (opt-out by default)

mex collects anonymous, opt-out usage data (command name, version, OS only —
never paths, arguments, file contents, or personal data).

```bash
DO_NOT_TRACK=1 mex-agent setup
MEX_TELEMETRY=0 mex-agent setup
mex-agent config set telemetry off
mex-agent telemetry inspect    # audit the exact payload before opting in/out
```

## MCP server — not published

`packages/mex-mcp` exists in the upstream monorepo and exposes the wiki and
event log as MCP tools, but it is **not published to npm** as of this
writing, and the released `mex-agent` package ships no `mex mcp` CLI
subcommand. The only supported way to run it today is from a source checkout:

```bash
git clone https://github.com/mex-memory/mex
cd mex && npm run build --workspace mex-mcp
```

Do not invent a `mex mcp add`/`mex mcp serve` invocation for Claude Code,
Cursor, jeo, gjc, jeopi, or OpenCode — no such flow ships in the released
package. Check the MCP server section of the README
(https://github.com/mex-memory/mex#mcp-server) before telling a user
otherwise; it may change once the package is published.

## Read-only doctor wrapper (this skill)

```bash
bash .agent-skills/mex/scripts/mex.sh doctor [project_path]
bash .agent-skills/mex/scripts/mex.sh check <project_path> [extra mex check args...]
bash .agent-skills/mex/scripts/mex.sh graph <project_path> [extra mex graph args...]
```

`doctor` never installs or modifies anything — it reports Node.js, the
resolved mex-agent executable, any shadowing TeX `mex`, Git status, `.mex/`,
and anchors. `check` and `graph` execute the real CLI; mex-agent 0.7.1 may
refresh `.mex/graph.db` during `check`, so use a scratch copy for strict
read-only audits.
