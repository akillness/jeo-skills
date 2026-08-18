# Mex command reference

All commands run from the project root. Replace `mex` with `npx mex-agent` if
it is not installed globally. Verified against `mex --help` / `mex <cmd>
--help` on mex-agent 0.7.1 and the upstream README
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

If PATH resolves to the wrong one, either fix PATH order (an npm global bin
directory must come before the TeX bin directory), or invoke every command as
`npx mex-agent <command>` instead of bare `mex`. `scripts/install.sh` and
`scripts/mex.sh doctor` in this skill both detect and warn about this
automatically — `install.sh` refuses to proceed rather than silently running
the wrong binary.

## Install

```bash
npm install -g mex-agent      # installs the `mex` binary globally
npx mex-agent setup           # run without a global install
mex --version
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

Registers the jeo-skills plugin, installs `mex-agent` if missing (and refuses
to continue if `mex` resolves to something else — see the collision note
above), runs `mex setup` non-interactively by piping the `--tool` choice into
its prompts (idempotent — skipped unless `.mex/` is absent or `--force` is
given), builds the code graph (`mex graph`), runs `mex check`, and reports
which project anchor file (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`,
`.windsurfrules`, `.github/copilot-instructions.md`, or
`.opencode/opencode.json`) mex installed. `--tool` defaults to `codex`
(`AGENTS.md`) because that is what jeo/gjc/jeopi read.

## Setup and scaffolding

```bash
mex setup                       # create .mex/ scaffold + project anchor file
mex setup --mode agent-memory   # add HEARTBEAT.md conventions for long-running
                                 # operational agents (homelabs, infra workspaces)
mex                              # open the interactive terminal dashboard
mex tui                          # same as bare `mex`
```

`mex setup` is interactive (it asks which tool anchor to write, then whether
to install mex globally) and only creates EMPTY scaffold files plus the
anchor. It does **not** auto-populate `.mex/context/*.md` or `.mex/patterns/`
— it prints a long prompt bounded by "COPY ABOVE THIS LINE" banners that a
human must paste into their coding agent's chat; that agent session is what
actually writes the project-specific wiki content. `scripts/install.sh`
detects this banner and warns so the step isn't silently skipped.

## Pre-analysis and diagnostics

```bash
mex init            # scan the codebase and print a pre-analysis brief for AI
mex init --json      # same, as JSON
mex doctor            # mex's own scaffold health diagnostic (not this skill's
                       # scripts/mex.sh doctor, which only checks the environment)
```

## Code graph (deterministic, Tree-sitter + SQLite)

```bash
mex graph                                  # build or refresh the local code graph
mex graph scope "trace the auth flow"      # compact, task-relevant context
mex graph get <node-id...>                 # expand exact symbols from a scope result
mex graph query where-defined <symbol>     # structural relationship queries
mex graph query who-calls <symbol>
mex graph query what-calls <symbol>
mex graph ground                           # connect a pre-0.7 wiki to the graph
```

Supports TypeScript, TSX, JavaScript, JSX, Python, and Rust, including
framework-aware Express route-to-handler relationships. Agent-facing graph
commands emit deterministic JSONL envelopes.

## Drift detection and repair

```bash
mex check     # validate paths, commands, deps, links, indexes, staleness,
              # tool config, and grounded code symbols — no AI tokens spent
mex sync      # repair stale/inconsistent knowledge with targeted agent prompts
mex impact <symbol|file>   # find code and wiki content affected by a change
```

## Project memory bookkeeping

```bash
mex log "<message>"   # record a decision, note, risk, or todo
mex timeline           # read recent project events
mex heartbeat          # run persistent-agent health checks (agent-memory mode)
mex pattern add <name>   # create a new pattern file and add it to the index
mex watch --interval [minutes]   # run mex heartbeat repeatedly instead of a hook
mex watch                          # install a post-commit hook
mex watch --uninstall               # remove the post-commit hook
```

## Utility

```bash
mex completion <shell>   # print shell completions
mex commands              # list every command and script
mex config set telemetry off
mex telemetry inspect
mex feedback               # open the mex feedback form
```

## Telemetry (opt-out by default)

mex collects anonymous, opt-out usage data (command name, version, OS only —
never paths, arguments, file contents, or personal data).

```bash
DO_NOT_TRACK=1 mex setup
MEX_TELEMETRY=0 mex setup
mex config set telemetry off
mex telemetry inspect    # audit the exact payload before opting in/out
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

`doctor` never installs or modifies anything — it only reports Node.js
version, whether `mex` on PATH is actually mex-agent (vs. a name collision),
Git repo status, `.mex/` scaffold presence, and which project anchor file
exists.
