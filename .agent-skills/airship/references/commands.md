# Airship CLI Reference

Source: [0xnyn/airship](https://github.com/0xnyn/airship) README (`@airshiplabs/cli`,
npm package version observed: `0.2.5`). Airship takes no positional
arguments; a bare `--` stops flag parsing and anything after it is ignored.
Flags accept `--flag value` or `--flag=value`, a camelCase spelling of any
kebab name (`--maxTurns` ≡ `--max-turns`), and `--no-<name>` to turn any
boolean off.

## Invocation forms

```
airship [options]
airship --target <port> [options]
airship <command> [options]
```

## Commands

| Command | Purpose |
| --- | --- |
| `airship` | Launch the visual editor against a dev server. Bare at a terminal, it asks first (port, agent, mode); needs a terminal. |
| `airship init` | Write `airship.config.json` from the same questions the bare wizard asks. Takes `--cwd` and the global flags. Needs a terminal. |
| `airship doctor` | Check the environment: `node`, `airship`, `config`, `git repo`, `overlay bundle`, `agent claude`, `agent codex`, `agent opencode`, `dev server`. Each reports `ok`/`warn`/`fail`. Only the preferred agent (`--agent`, default `claude`) can fail the run; the other two warn. Exits `1` if any check failed. Takes `--cwd`, `--target`, `--agent` and the global flags. |

## Core flags

| Flag | Description | Default |
| --- | --- | --- |
| `-t, --target <port>` | Port the dev server is already running on. Detected from `package.json` when omitted. | — |
| `-p, --port <port>` | Port for the Airship proxy. | `target + 1` |
| `--cwd <dir>` | Project root for edits. | current directory |
| `--mode <name>` | Editor mode: `canvas` or `inline`. Switchable from the editor. | `canvas` |
| `--exec <command>` | Start the dev server with this command and stop it when Airship exits. | — |
| `--open` | Open the editor in the browser once it is listening. | — |

## Agent flags

| Flag | Description | Default |
| --- | --- | --- |
| `-a, --agent <name>` | Coding agent: `claude`, `codex`, `opencode`. | `claude` |
| `-m, --model <id>` | Model id (`-m` is `--model`, not `--mode`; `--mode` has no short alias). | agent's own default |
| `--effort <level>` | Reasoning effort: `minimal`, `low`, `medium`, `high`, `xhigh`, `max`. | — |
| `--max-turns <n>` | Cap agent turns per edit (`claude` only). | `24` |
| `--max-budget <usd>` | Stop an edit if it exceeds this cost in USD (`claude` only). | — |
| `--commit` | Auto-commit each accepted edit (Conventional Commits). | — |

## Sandbox flags

| Flag | Description | Default |
| --- | --- | --- |
| `--safe` | Confine edits to the project directory and cut network access. Strength varies by agent (see Safety below). | off |

## Backend flags

| Flag | Description | Default |
| --- | --- | --- |
| `--codex-path <path>` | Path to the `codex` binary. | bundled |
| `--codex-config <k=v>` | Extra `codex --config` pair; repeatable. `true`/`false`/numeric-looking values become TOML booleans/numbers — quote (`k='"true"'`) to keep a string. | — |
| `--opencode-path <path>` | Path to the `opencode` binary. | found on PATH |
| `--opencode-url <url>` | Attach to a running `opencode serve` instead of starting one. | — |
| `--opencode-agent <name>` | Run as a named opencode agent. | its own |
| `--opencode-config <file>` | JSON file merged into the opencode server config. | — |

## Global flags

| Flag | Description |
| --- | --- |
| `--json` | Machine-readable JSON on stdout, no colour, no banner. |
| `-q, --quiet` | Suppress the launch banner. Warnings still print. |
| `--debug` | Print stack traces on failure. |
| `-h, --help` | Show help. |
| `-v, --version` | Print the version. |

Banners, warnings and errors go to stderr; `--json` payloads, help and
`--version` go to stdout, so `airship --json | jq` is reliable.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Fine. |
| `1` | Something failed. |
| `2` | Bad flag, bad value, or a terminal was needed and there wasn't one. |
| `127` | Not an airship command. |
| `130` | Interrupted — Ctrl-C, or a cancelled prompt. |

## Agents

| | `claude` (default) | `codex` | `opencode` |
| --- | --- | --- | --- |
| Watch it write | word by word | whole reply at once, at the end | word by word |
| Pick up an old chat | yes | yes | yes |
| Branch off a chat | yes | starts fresh, and says so | yes, history kept |
| Shows what it cost | in dollars | tokens only | in dollars |
| `--effort` | yes | yes | ignored |
| `--max-turns`, `--max-budget` | yes | ignored | ignored |
| `--model` | a model name | a model name | needs `provider/model` form |
| `--safe` | checks each edit and command | real sandbox | asks before each edit and command |
| Install | included | included | install yourself (`brew install sst/tap/opencode` or `npm i -g opencode-ai`) |

Undo is Airship's, not the agent's — it keeps the previous version of every
file it touches. One catch: `codex` and `opencode` get that previous
version from Git, so **undo needs the project to be a Git repo on those
two**; `claude` is unaffected.

### Authentication

| Agent | Needs one of |
| --- | --- |
| `claude` | `ANTHROPIC_API_KEY`, `CLAUDE_CODE_OAUTH_TOKEN`, or a `claude` login (`~/.claude`) |
| `codex` | `CODEX_API_KEY`, `OPENAI_API_KEY`, or a `codex login` (`~/.codex/auth.json`) |
| `opencode` | the `opencode` binary on PATH, plus a provider key or an `opencode auth login` (accepts `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OPENCODE_API_KEY`, `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `AWS_BEARER_TOKEN_BEDROCK`, `AWS_ACCESS_KEY_ID`) |

## Safety

By default the agent runs unsandboxed — full write and network access,
same as running it from a terminal. `--safe` confines it:

| | default | `--safe` |
| --- | --- | --- |
| `codex` | full access, network on | locked to the project folder, no network, no web search |
| `claude` | full access, no sandbox | edits kept inside the project, dangerous commands blocked |
| `opencode` | full access | asks before every edit and command, checked the same way; no web fetch, no web search, nothing outside the project |

Caveats:

- Only `codex` gets a real OS-level sandbox. `claude`/`opencode` get a
  pre-flight check that catches known-dangerous commands (like `rm -rf`)
  but does not understand shell redirection to another path (`echo x >
  /elsewhere`).
- `claude` and `opencode` can still reach the network under `--safe` —
  their web tools are switched off, but a command they run could still open
  a connection.
- For a hard guarantee, use `airship --agent codex --safe`.
- Diffs and undo work the same regardless of `--safe`.

## Configuration

Resolution order, highest first:

```
flags  →  AIRSHIP_* environment  →  airship.config.json  →  defaults
```

`airship.config.json`, or an `"airship"` key in `package.json`. Every key is
a flag name in kebab or camel case:

```json
{
  "agent": "claude",
  "mode": "canvas",
  "target": 3000,
  "safe": true
}
```

Airship looks for the config file from `--cwd` upwards and stops at the
repository root. Misspelling a key produces a suggestion rather than being
silently ignored.

### Environment variables

Every flag except `--help`/`--version` has an env var: `AIRSHIP_` plus the
flag name, uppercased, `-` as `_` (e.g. `AIRSHIP_TARGET`, `AIRSHIP_AGENT`,
`AIRSHIP_CODEX_CONFIG`, `AIRSHIP_SAFE`, `AIRSHIP_JSON`). Booleans take
`1`/`true`/`yes`/`on` or `0`/`false`/`no`/`off`; anything else errors rather
than guesses. Also honoured: `AIRSHIP_EDITOR` (`vscode`, `cursor`,
`windsurf`, `zed`), `NO_COLOR`, `FORCE_COLOR`.

### `--cwd`

`--cwd` is the folder the dev server treats as its root, which may not be
the repository root. Airship needs it to turn dev-server-reported paths
(`/src/app.tsx`) into real files on disk. In a monorepo where the app lives
in `apps/web`, that is `--cwd apps/web`.

## Port detection

With `--target` omitted, Airship tries in order:

1. The port in the dev script (`--port`, `-p`, or `PORT=` in
   `scripts.dev`/`scripts.start`/`scripts.serve`).
2. The framework default, from dependencies: `next`/`nuxt`/`@remix-run/dev`/
   `react-scripts` → `3000`; `parcel` → `1234`; `@angular/cli` → `4200`;
   `astro` → `4321`; `@sveltejs/kit`/`vite` → `5173`; `storybook` → `6006`;
   `gatsby` → `8000`; `@11ty/eleventy` → `8080`. Most specific dependency
   wins (e.g. `vite` + `storybook` resolves as Storybook).
3. Common ports: `3000`, `5173`, `8080`, `4321`, `4200`.

With `--exec`, the opposite applies: Airship needs a *free* port, since it
is about to start the dev server itself.
