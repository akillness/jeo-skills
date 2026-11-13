# Command catalog

Source: `browser_use/cli.py` and `browser_use/skills/install.py` at the pin, the `browser-use --help` text, and the helper names
resolved in an isolated 1.0.3 install. Trust `browser-use --help` over this page on any other version. Tiers refer to the table in
[`SKILL.md`](../SKILL.md): 1 read-only, 2 reads private data, 3 spends or discloses, 4 changes the environment.

## CLI commands

| Command | Effect | Tier |
|---|---|---|
| `browser-use --version` | Prints `browser-use 1.0.3 (browser-harness 0.1.13)`. Writes nothing | 1 |
| `browser-use --help`, `help` | Prints the command list. Writes nothing | 1 |
| `browser-use skill show` | Prints upstream's skill text to stdout. Writes nothing | 1 |
| `browser-use auth status` | JSON `status` / `source` / `path` of the stored key; creates harness directories | 1 |
| `browser-use telemetry status` | JSON `enabled` / `disabled_by_env` / `disabled_by_config`; creates harness directories | 1 |
| `browser-use recordings` | Lists `auto-recording`, `active`, `latest`. `--latest` names the newest recording | 1 |
| `browser-use --doctor`, `doctor` | Version, local browser, whether Chrome runs, daemon state, cloud key. Exit 1 only when no local browser **and** no key exist | 1 |
| `browser-use doctor --fix-snap` | Prints how to fix Snap Chromium blocking CDP (Linux) | 1 |
| `browser-use <<'PY' ... PY` | Runs the Python on the persistent daemon. Starts the daemon and attaches to the user's running Chrome, else to the CLI's own Chromium | 2 (3 once it starts a cloud browser) |
| `browser-use --cli-mcp` | Stdio MCP server: tools `browser_exec`, `browser_screenshot`, `browser_login`, `browser_feedback` | 2 to run; registering it in a host is 4 |
| `browser-use --mcp` (deprecated) | Serves the same tools on its own Chromium and keeps the 0.x config's `allowed_domains` / `prohibited_domains`; a 0.x proxy setting makes it exit 2 | 2 / 4 |
| `browser-use login [--device-code \| --api-key-stdin] [--no-open] [--json]`, `auth login` | OAuth sign-in in the browser (or a key from stdin, checked once against the server) and stores `auth.json` | 3 |
| `browser-use logout`, `auth logout` | Removes the stored key | 4 |
| `browser-use mac-approve` | Clicks Chrome's "Allow remote debugging?" sheet through macOS Accessibility | 4 |
| `browser-use --reload` | Restarts the daemon and closes the CLI's own Chromium | 4 |
| `browser-use install` | `uvx playwright install chromium` (`--with-deps` on Linux) | 4 |
| `browser-use skill install [--target NAME] [--path DIR] [--install-cli]` | Writes `SKILL.md` into skill roots. `--install-cli` also force-reinstalls this version as a uv tool. **Do not run; see below** | 4 |
| `browser-use telemetry enable \| disable` | Writes `telemetry.json` in the harness config directory | 4 |
| `browser-use recordings enable \| disable` | Turns local background traces on or off (they can capture sensitive pages) | 4 |
| `browser-use video init \| review \| export` | Post-production on a recording | 4 (writes files) |
| `browser-use feedback "text" [--category bug\|docs\|missing\|other]` | Sends the text to the Browser Use team after scrubbing keys, emails, URL queries and home folders | 3 |

Removed 0.x commands (`open`, `state`, `click`, `type`, `input`, `keys`, `scroll`, `back`, `hover`, `screenshot`, `eval`, `cookies`,
`python`, `run`, `connect`, `close`, `sessions`, `profile`, `cloud`, `daemon`, `record`, `mcp` as a subcommand, `init`) exit 2 with a
replacement hint. `browser-use --update` is refused: upgrade with `uv tool upgrade browser-use` or `pip install -U browser-use`.

### `skill install` targets

`--target all` (the default) writes `<root>/browser-use/SKILL.md` for `~/.agents` always, and for `~/.claude`, `~/.codex`,
`~/.copilot`, `~/.cursor`, `~/.gemini`, `~/.openclaw` and `~/.config/opencode` when that agent directory exists. It overwrites an
existing `SKILL.md`, follows symlinks, and leaves other files in the folder alone. `--path DIR` writes `DIR/SKILL.md` only.

## Helpers available to piped code (CLI and `--cli-mcp`)

Pre-imported from browser-harness 0.1.13 (`helpers` and `admin`), confirmed present in the install:

- Navigate and wait: `new_tab(url)`, `goto_url(url)`, `wait_for_load()`, `wait_for_element(selector)`
- Inspect: `page_info()`, `js(code)`, `cdp(method, **params)`, `capture_screenshot()`, `current_tab()`, `list_tabs()`
- Interact: `click_at_xy(x, y)`, `type_text(text)`, `fill_input(selector, text)`, `press_key(key)`, `dispatch_key(...)`, `scroll(x, y, dy=...)`
- Tabs: `switch_tab(target)`, `close_tab(target)`, `ensure_real_tab()`, `activate_tab(target)` (visibly switches tabs)
- Files and network: `upload_file(selector, path)` (sends the bytes through the page on a cloud browser), `http_get(url)` (plain HTTP from this
  machine; it no longer goes through the fetch-use proxy when a Browser Use key is set)
- Recording: `start_recording(name, title=...)` writes one screenshot and trace line per action into the recordings directory until `stop_recording()`; it refuses only when `BH_RECORD=0`, so call it only when the user asked to record (upstream's own rule: a request to "record", "show", "demo" or "make a video" opts in; significant work alone does not)
- Cloud browsers: `start_remote_daemon(name)`, `stop_remote_daemon(name)`
- Everything in `agent-workspace/agent_helpers.py` (executed code; see [`safety.md`](safety.md))

Rules from upstream's skill: open the first page with `new_tab(url)` (the daemon keeps the attached tab across invocations), keep one
working tab per site and reuse it with `list_tabs()` / `switch_tab()`, find elements through `cdp("Accessibility.getFullAXTree")` and click
box centers, call `wait_for_load()` after navigation, and treat a timed-out `scroll()` on a background tab as the signal to
`activate_tab(current_tab())` once, only if the user has not forbidden foreground changes.

## Extra helpers inside `Agent` runs (library only)

Defined by the Agent's REPL worker (`browser_use/repl/worker.py`): `screenshot(full=False)`, `checkpoint(filename, value, partial=False)`,
`type_secret(name, id=None)`, `solve_captcha()`, `downloads()`, `search(query, num_results=None, category=None)` (only with `web_search=True`, billed per
search), `report_issue` and a cloud-aware `upload_file`. The model ends a run with the `finish(result)` tool or `finish_from_repl`, which sit beside the `python`
tool rather than inside the REPL. The CLI and `--cli-mcp` run on the browser-harness set above, where `type_secret`, `solve_captcha`, `downloads`,
`checkpoint` and `screenshot` do not exist (checked in the installed package).

## `--cli-mcp` tools

`browser_exec(code)` runs piped-code semantics in the server process; `browser_screenshot`; `browser_login` (opens the browser to approve and
stores the same key); `browser_feedback`. Notes from `MIGRATING.md` and `cli_mcp.py`: code runs in the server's process and can read its
environment (`BROWSER_USE_API_KEY` when set) and files; a cloud browser it starts lives 30 minutes unless `timeout=<minutes>` (up to 240) and is
stopped when the server exits; live-view and CDP URLs are neither opened nor returned unless `BH_OPEN_LIVE_URL=1`. The old tool names
(`browser_navigate`, `browser_click`, ...) return a "removed" error naming `browser_exec`.

## Environment variables

| Variable | Meaning |
|---|---|
| `BROWSER_USE_API_KEY` | Browser Use key; wins over the stored `auth.json`. Never print it |
| `ANONYMIZED_TELEMETRY`, `BH_TELEMETRY`, `BROWSER_HARNESS_TELEMETRY` | `false` / `0` / `no` / `off` disable telemetry (default on) |
| `BU_NAME` | Daemon name; use the same name for every call to one browser |
| `BU_CDP_URL`, `BU_CDP_WS` | Attach to an existing CDP endpoint (HTTP or WebSocket). May embed a key; never log |
| `BH_OPEN_LIVE_URL` | `1` prints or opens a cloud live-view URL; `0` keeps it unprinted. The URL grants control of the browser |
| `BH_REQUIRE_EXISTING_DAEMON` | `1` makes each call reuse the exact named daemon or fail; it never auto-starts or discovers another Chrome |
| `BH_DOMAIN_SKILLS` | `1` enables `agent-workspace/domain-skills/<site>/` playbooks (off by default) |
| `BH_RECORD` | `1` / `0` overrides the recordings preference for one process |
| `BH_TAB_MARKER` | `0` leaves page titles unchanged (the default adds a horse marker to attached tabs) |
| `BH_CHROME_PATH`, `CHROME_PATH` | A specific browser binary; Snap Chromium is refused |
| `BH_HOME`, `BROWSER_HARNESS_HOME`, `BH_CONFIG_DIR`, `BH_RUNTIME_DIR`, `BH_TMP_DIR`, `BH_AGENT_WORKSPACE`, `BROWSER_USE_CONFIG_DIR` | Relocate state; the daemon socket path is capped at 104 (macOS) or 108 (Linux) bytes |
| `PLAYWRIGHT_BROWSERS_PATH` | Where `browser-use install` and `Browser('chromium')` look for Playwright's Chromium |
| `BROWSER_USE_LOGGING_LEVEL` | `warning` silences the per-step INFO lines |
| `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` | Provider keys for `ChatOpenAI`, `ChatAnthropic`, `ChatGoogle` |
| `BROWSER_USE_ALLOWED_DOMAINS`, `BROWSER_USE_PROXY_*` (0.x) | Removed: `Browser()` raises while the first is set; the proxy variables make `--mcp` exit 2 |

## Exit codes

`0` success. `1` an error, empty stdin, a failed cloud call or a failed `--doctor` (nothing can run). `2` a removed 0.x command, bad arguments or an
`--mcp` configuration that 1.0 cannot honor. `130` login cancelled.
