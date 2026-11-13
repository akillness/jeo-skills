# Pinned upstream reference

| Field | Value |
|---|---|
| Repository | https://github.com/browser-use/browser-use |
| Audited commit | `dfb6a73d520809341c975c6a01c228327991e88b` (tag `1.0.3`, release "browser-use 1.0.3", published 2026-11-12T16:52:54Z; also the head of `main` when observed on 2026-11-13) |
| Package | `browser-use` on PyPI, version 1.0.3, `requires-python >=3.11,<4.0`; wheel and sdist SHA-256 in [`source.json`](source.json) |
| License | MIT, Copyright (c) 2024 Gregor Zunic (`LICENSE`, `pyproject.toml`, GitHub API) |
| Entry points | `browser-use` and `browseruse` (the same CLI); `browser-use-tui` is a deprecated alias that prints a notice |
| Pinned runtime dependencies | `browser-harness==0.1.13`, `pydantic-ai-slim[openai,anthropic,google]==2.66.0`, `pydantic==2.14.3`, `google-genai==2.34.0`, `mcp==2.3.0`, `pillow==12.3.0`, plus four more (full list in `source.json`). A throwaway venv resolved 60 packages and 121 MB |
| Docs | https://docs.browser-use.com (index: `/llms.txt`), https://browser-use.com/pricing.md, `README.md`, `MIGRATING.md`, `CLOUD.md`, `AGENTS.md` |

The audit read the files hashed in [`source.json`](source.json) at that commit. Separately, `browser-use==1.0.3` was installed from PyPI into a
throwaway virtual environment and the read-only commands below were executed with `HOME` pointed at an empty directory and
telemetry off. No browser was launched, no key or account was used, and no cloud browser was created.

## What it is

Browser Use 1.0 is a browser agent on Pydantic AI. The model does not pick one action per step from a DOM dump: it writes Python
in one persistent REPL that has the browser-harness helpers and raw CDP. Three ways to use it share that engine:

1. **CLI** (`browser-use`): Python piped on stdin runs against a daemon that attaches to the user's running Chrome, or to a
   Chromium of its own when it cannot (no display, remote debugging off). `--cli-mcp` serves the same session over MCP.
2. **Python library** (`from browser_use import Agent, Browser, Tools`): `Agent(task, llm, browser).run()` keeps the 0.x public
   names on the new engine. Defaults send the task to the Browser Use gateway (`bu-fast`) and drive a Browser Use Cloud browser.
3. **Browser Use Cloud** (hosted, not open source): cloud browsers over CDP and the Agents API (v4), billed. The open-source
   repository is only the library and CLI.

The org also publishes `browser-harness` (the CDP daemon and helpers that browser-use pins), `jev-ultrafast`, `video-use`,
`browser-use-pi`, `sdk`, `macos-harness`, `benchmark` and others. This skill covers `browser-use/browser-use` only; catalog routing
for the rest is in the last section.

## Install routes

| Route | Command | What it changes |
|---|---|---|
| uv tool (upstream's agent prompt) | `uv tool install browser-use==1.0.3` | A tool environment under uv's tool dir and `browser-use` / `browseruse` on PATH. Pulls the 60-package dependency set. No global agent config. |
| venv | `python3 -m venv .venv && .venv/bin/pip install 'browser-use==1.0.3'` | Package only, in that venv. Python 3.11 or newer. |
| Project dependency | `uv add 'browser-use==1.0.3'` | Edits `pyproject.toml` and `uv.lock`. |
| Local Chromium | `browser-use install` | Runs `uvx playwright install chromium` (adds `--with-deps` on Linux, which can need root and system packages) into Playwright's cache. Needed only for `Browser('chromium')` without an installed Chrome. |
| Upstream skill | `browser-use skill install` | Writes `SKILL.md` into `~/.agents` and each installed agent directory. **Collides with this skill; see Hazards.** |

Upstream tells agents to pin exactly (`==`, never `>=`) because releases move fast and can break APIs, and the CLI never updates
itself (`uv tool upgrade browser-use` or `pip install -U browser-use`).

## Files and services browser-use touches

- `~/.config/browser-harness/` (or `BH_HOME`, `BROWSER_HARNESS_HOME`, `XDG_CONFIG_HOME/browser-harness`; `BH_CONFIG_DIR`, `BH_RUNTIME_DIR`,
  `BH_TMP_DIR`, `BH_AGENT_WORKSPACE` override single parts): `auth.json` (the stored Browser Use key), `telemetry.json`, `runtime/`
  (daemon sockets, pid files and `*.cloud` files that hold a recorded cloud browser id), `tmp/` (screenshots, daemon log) and
  `agent-workspace/` (`agent_helpers.py` and `domain-skills/`). `browser_harness.helpers` runs `exec_module` on
  `agent-workspace/agent_helpers.py` at import, so the CLI and `--cli-mcp` execute it on every call.
- `~/.config/browseruse/` (or `BROWSER_USE_CONFIG_DIR`): the anonymous telemetry device id, an outbox and any 0.x config.
- A `.env` in the working directory or a parent, loaded on import by `Agent` and `Browser`.
- `~/.agents/skills/browser-use/SKILL.md` and the same file under `~/.claude`, `~/.codex`, `~/.copilot`, `~/.cursor`, `~/.gemini`,
  `~/.openclaw` and `~/.config/opencode` when `browser-use skill install` runs.
- The user's Chrome: after the user enables `chrome://inspect/#remote-debugging`, the daemon attaches over CDP and Chrome shows
  "Allow remote debugging?". `Browser('chromium')` and `Browser('chrome', profile=...)` listen on an unauthenticated `127.0.0.1` port.
- PostHog (`https://eu.i.posthog.com`) for usage telemetry, on by default; Browser Use Cloud and the model gateway when a key is used.

## Checks executed on 1.0.3 (isolated venv, empty HOME, `ANONYMIZED_TELEMETRY=false BH_TELEMETRY=0`)

| Command or call | Observed |
|---|---|
| `browser-use --version` | `browser-use 1.0.3 (browser-harness 0.1.13)`, exit 0, writes nothing |
| `browser-use --help` | The command list in [`command-catalog.md`](command-catalog.md); exit 0, writes nothing |
| `browser-use skill show` | 10,858 bytes, byte-identical to upstream `skills/browser-use/SKILL.md` and to the packaged copy; writes nothing |
| `browser-use skill install --path DIR` | Writes only `DIR/SKILL.md` |
| `browser-use auth status` | `{"status": "missing", "source": null, "path": ".../browser-harness/auth.json"}`; creates the config directory with empty `agent-workspace/`, `runtime/` and `tmp/` inside |
| `browser-use --doctor` | Exit 0 on a fresh install: version line, local browser found, "Chrome running yes", daemon stopped, "cloud key none: browser-use login". Creates the same directories |
| `browser-use telemetry status` | With `ANONYMIZED_TELEMETRY=false`: `enabled: false`, `disabled_by_env: true`, `install_id: null` |
| `browser-use recordings` | `auto-recording: off (default)`, `active: none`, `latest: none` |
| `browser-use open https://example.com` (a 0.x command) | Exit 2 with a migration message; the 0.x subcommands (`open`, `state`, `click`, `input`, ...) are gone |
| `browser-use < /dev/null` | Exit 1: "browser-use received empty stdin" |
| `from browser_use import BrowserSession` | `AttributeError: ... was removed in browser-use 1.0 ... In 1.0: Browser(...)` |
| `Browser(headless=True)` (cloud) | `ValueError`: a cloud browser does not take `headless=` |
| `Browser(window_size=...)` | `TypeError`: removed in 1.0 |
| `Browser()` with `BROWSER_USE_ALLOWED_DOMAINS` set | `RuntimeError`: the variable was removed; use `Browser(allowed_domains=[...])` |
| `Agent('x', max_steps=3)` | `TypeError`: pass it to `agent.run(max_steps=...)` |
| `Agent('x', use_judge=True)` | Warning only: ignored in 1.0 |
| `Agent('x', browser_profile=...)` | `TypeError`: pass options to `Browser(...)` |
| `Browser('chromium', headless=True, allowed_domains=[...])`, `Agent(..., llm=ChatOpenAI(...), browser=...)` | Construct without error; nothing was launched |

Only source-read, not executed: telemetry delivery with telemetry on, `browser-use login`, any browser launch or attach, cloud
browsers, `--cli-mcp`, `mac-approve`, `browser-use install` and a real `Agent` run.

## Hazards found (recorded, not assumed)

1. **`browser-use skill install` replaces this skill.** End to end with the real catalog install (`npx skills@1.7.0 add <this repo> --skill browser-use
   --agent universal --copy --full-depth --global`, the command `jeo-skill install browser-use --global --yes` delegates to) in an empty HOME:
   the installed `SKILL.md` was this skill's, the preflight classified it `catalog`, and upstream's default `browser-use skill install` then replaced it with
   text byte-identical to upstream's (SHA-256 equal) and also wrote `~/.claude/skills/browser-use/SKILL.md` and `~/.codex/skills/browser-use/SKILL.md`
   because those agent directories existed. This skill's `references/` files survived. The preflight then reported `skill_install_collision: warn` with
   three upstream-authored copies. Re-running the catalog install restored the shared-root `SKILL.md` (SHA-256 equal to the catalog's) but not the
   `.claude` and `.codex` copies. With `~/.claude/skills/browser-use` as a symlink to the shared root, `--target claude` wrote through the symlink into the
   shared root's `SKILL.md`. Upstream's own agent prompt says to run this command.
2. **Telemetry is on by default and covers `--help` and `--version`** (source-read; delivery was not executed). `ANONYMIZED_TELEMETRY`
   defaults to true, and `main()` captures a CLI event after every command that does not run piped code, which the library's sender
   posts to PostHog with the piped code, its output and helper arguments removed and error text scrubbed.
   `ANONYMIZED_TELEMETRY=false`, `BH_TELEMETRY=0` or `browser-use telemetry disable` turn it off; `browser-use feedback` still sends
   the text the user chose to send.
3. **`agent_helpers.py` is executed code.** Anything in `agent-workspace/agent_helpers.py` runs inside every CLI and `--cli-mcp`
   call (the library's own REPL worker does not load it).
4. **The default library run bills and discloses.** `Agent(task)` with no arguments uses the Browser Use gateway model and a
   Browser Use Cloud browser (US residential proxy on); the workspace temp directory keeps page text, screenshots and cell output
   after the run.
5. **Cloud browsers keep billing after CDP closes.** Stop explicitly with `stop_remote_daemon(name)`,
   `client.browsers.stop(id)` or `PATCH /api/v4/browsers/{id}` with `{"action": "stop"}`. The CLI records the browser id in a
   `*.cloud` file until a stop succeeds.
6. **Local debugging ports are unauthenticated.** On a shared machine any local account can attach to a `Browser('chromium')` or
   `Browser('chrome', profile=...)` browser, read its cookies and drive it for as long as it runs.
7. **Model-written Python can read the user's files and other processes' environment** (`ps -E` on macOS, `/proc/<pid>/environ`
   on Linux), including provider and Browser Use keys; `sensitive_data` redaction and `allowed_domains` are not sandboxes
   (screenshots, `js()` field reads, subresources, the REPL's own networking and iframes are outside them).
8. **Upstream's `qa` skill is not safe for blanket use.** It tells agents to install the CLI themselves (`curl | sh` for uv),
   to self-sign-up for a free key with no human, and to expose a local dev server through a public ngrok or cloudflared tunnel
   with host-header rewrite so a cloud browser can reach it.
9. **Upstream's `x402` skill moves money.** It guides creating or importing a crypto wallet, writing its private key to `.env` and
   paying Browser Use per request in USDC on Base mainnet.
10. **`mac-approve` presses a security prompt.** It uses macOS Accessibility (AppleScript through System Events) to click "Allow" on
    Chrome's "Allow remote debugging?" sheet. It needs the launching app in Privacy & Security > Accessibility.

## Version cautions

- 1.0 replaced the engine. 0.x code (`BrowserSession`, `BrowserProfile`, 0.1-era `Controller` options, `browser_use.llm.*` modules,
  `--mcp` tools like `browser_navigate`) raises a named "removed in browser-use 1.0" error before a browser starts; see
  [`library-and-cloud.md`](library-and-cloud.md). `pip install 'browser-use<1'` keeps 0.x.
- Browser Harness is pinned (`==0.1.13`); do not upgrade it independently of browser-use.
- Model names and the `bu-*` aliases change quickly. Do not "correct" a model name the user chose.
- Prices, free credit and concurrency limits are a snapshot: read https://browser-use.com/pricing.md before quoting a number.

## Org repositories and catalog routing

| Repository | Catalog route |
|---|---|
| `browser-use/browser-harness` | `browser-harness` skill (CDP helpers, domain skills; browser-use pins it) |
| `browser-use/jev-ultrafast` | `jev-ultrafast` skill |
| `browser-use/video-use` | `video-use` skill |
| `browser-use/browser-use-pi`, `sdk`, `macos-harness`, `benchmark`, `web-ui`, `workflow-use`, `browsercode` | no catalog skill; read the repository |

Observed 2026-11-13 through the GitHub API: `browser-use/browser-use` had about 121k stars and 61 repositories existed in the org; `macOS-use` is archived.
