# Mole — command, flag, and environment reference

`mole` is the entrypoint; `mo` is a thin alias (`exec "$SCRIPT_DIR/mole" "$@"`).
Both spellings work everywhere. Public docs prefer `mo`; use `./mole` inside a
source checkout.

Bare `mo` opens the interactive menu (`↑↓ | Enter | M More | V Version |
T TouchID | U Update | Q Quit`).

## Command list

Straight from `lib/core/commands.sh`:

| Command | Purpose |
|---|---|
| `clean` | Free up disk space |
| `uninstall` | Remove apps completely |
| `optimize` (`optimise`) | Refresh caches and services |
| `analyze` (`analyse`) | Explore disk usage |
| `status` | Monitor system health |
| `history` | Review cleanup activity |
| `purge` | Remove old project artifacts |
| `installer` | Find and remove installer files |
| `touchid` | Configure Touch ID for sudo |
| `completion` | Setup shell tab completion |
| `update` | Update to latest version |
| `remove` | Remove Mole from system |
| `help` (`--help`, `-h`) | Show help |
| `version` (`--version`, `-V`) | Show version |

`--debug` is stripped globally and exported as `MO_DEBUG=1`, so it works on any
command.

## Flags per command

### `mo clean [OPTIONS]` — permanent deletion

| Flag | Effect |
|---|---|
| `--dry-run`, `-n` | Preview; also writes `~/.config/mole/clean-list.txt` |
| `--external PATH` | Clean macOS metadata off a mounted external volume |
| `--whitelist` | Manage protected cache paths |
| `--debug` | Detailed operation logs |

Also sweeps leftovers from apps the user already deleted. It does **not** touch
installed apps — that is `uninstall`.

### `mo uninstall [OPTIONS] [APP_NAME ...]` — Trash by default

| Flag | Effect |
|---|---|
| `--list` | List installed apps with the exact name `uninstall` accepts |
| `--dry-run` | Preview the app + leftovers plan |
| `--permanent` | Bypass Trash, delete immediately |
| `--debug` | Detailed operation logs |

`--whitelist` is **not supported** here (use `clean` / `optimize`).
Examples: `mo uninstall slack`, `mo uninstall slack zoom`,
`mo uninstall --dry-run slack`.

### `mo optimize [OPTIONS]`

`--dry-run`, `--whitelist`, `--debug`, `-h/--help`. Bounded maintenance for
Finder, network, database, and macOS services. Tasks that are unnecessary,
unsafe right now, or unavailable are skipped with a reason. Whitelist entries
accept path patterns, so a long-lived mounted image such as `/Volumes/mail`
can be excluded from detach candidates.

### `mo purge [OPTIONS]` — permanent deletion

| Flag | Effect |
|---|---|
| `--paths` | Configure scan directories |
| `--dry-run`, `-n` | Preview (prints to terminal; writes no file) |
| `--include-empty` | Show zero-size candidates |
| `--debug` | Detailed operation logs |

Finds `node_modules`, `target`, `.build`, `build`, `dist`, and similar. Groups
by project. Artifacts with file activity in the last 7 days — or activity Mole
cannot verify — are **unselected by default**. Uses `fd` when available, falls
back to `find`.

### `mo installer [OPTIONS]` — permanent deletion

`--dry-run`, `--debug`, `-h/--help`. Finds DMG, PKG, MPKG, ISO, XIP, and
installer ZIP files across Downloads, Desktop, Homebrew caches, iCloud, Mail,
Telegram, and other supported locations.

### `mo analyze [PATH] [--json]` — Trash after confirmation

Terminal disk explorer. Arrow + Vim navigation, filtering, multi-selection,
Finder preview, confirmed moves to Trash. External drives are excluded from the
default overview — inspect them explicitly:

```bash
mo analyze /Volumes
mo analyze /private/tmp
mo analyze --json ~/Documents
```

### `mo status [FLAGS]` — read-only

| Flag | Default | Effect |
|---|---|---|
| `--json` | false | one snapshot as JSON |
| `--watch` | false | NDJSON stream from a warm collector |
| `--interval` | `1s` | watch interval (e.g. `2s`) |
| `--proc-cpu-threshold` | `100` | CPU % for process alerts |
| `--proc-cpu-window` | `5m` | sustained window for alerts |
| `--proc-cpu-alerts` | `true` | set `=false` to disable |

Auto-switches to JSON when stdout is not a TTY. Interactive keys: `k` toggles
the cat, `c` cycles how many CPU cores are shown, `q` quits. Preferences persist.

### `mo history [OPTIONS]` — read-only

`--json`, `--limit N` (N is **1–200**), `-h/--help`.

### `mo touchid [COMMAND]`

Commands `enable`, `disable`, `status`; option `--dry-run`. No command opens an
interactive menu.

### `mo completion [bash|zsh|fish]`

Bare form auto-detects the shell and installs. `--dry-run` previews config
changes. Manual wiring:

```bash
eval "$(mole completion bash)"
eval "$(mole completion zsh)"
mole completion fish | source
```

Fish also writes `~/.config/fish/completions/mole.fish` and `mo.fish`.

### `mo update [--force|-f] [--nightly]`

`--nightly` installs unreleased `main` and is **script-install only**.

### `mo remove [--dry-run|-n]`

Removes Mole itself. Detects Homebrew-owned installs and runs
`brew uninstall --force mole`; otherwise removes `mole`/`mo` from
`/usr/local/bin`, `$HOME/.local/bin`, `/opt/local/bin`, plus `~/.cache/mole`
and `~/.config/mole`.

## Install and update

```bash
brew install mole      # homebrew-core (Formula/m/mole.rb) — NOT a tap
brew upgrade mole

curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash
curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash -s -- 1.51.0
curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash -s -- main

mkdir -p "$HOME/.local/bin"
curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash -s -- --prefix "$HOME/.local/bin"
export PATH="$HOME/.local/bin:$PATH"
```

`install.sh` flags: `--prefix <dir>`, `--config <dir>`, `--update`,
`--verbose`/`-v`. Positional version tokens: a tag (`1.x.x` or `V1.x.x`),
`main`, `dev`, or `latest`. **`latest` is a legacy alias for `main`** — it
installs unreleased code, not the newest stable release. `--help` is rejected
as an unknown option.

Defaults: `INSTALL_DIR=/usr/local/bin`, `CONFIG_DIR=$HOME/.config/mole`. The
installer copies `mole` + `mo` into `INSTALL_DIR`, copies `bin/` and `lib/`
into `CONFIG_DIR`, and rewrites `SCRIPT_DIR=` in the installed `mole`.

Release assets are `analyze-darwin-{amd64,arm64}`,
`status-darwin-{amd64,arm64}`, `binaries-darwin-{amd64,arm64}.tar.gz`, and
`SHA256SUMS`, plus a GitHub build-provenance attestation. There is **no `.dmg`
or `.pkg`** for the CLI. Release tags use a capital `V` (`V1.52.0`).

## The four agent-facing surfaces

Everything else is drawn for humans.

### 1. `mo analyze --json [path]`

```json
{
  "path": "/Users/you/Documents",
  "overview": false,
  "entries": [{ "name": "Library", "path": "...", "size": 80939438080, "is_dir": true }],
  "large_files": [{ "name": "backup.zip", "path": "...", "size": 8796093022 }],
  "total_size": 168393441280,
  "total_files": 42187
}
```

`size` is bytes. Entries also carry `insight: true` when Mole considers the
item noteworthy (a large iOS backup, a runaway cache).

### 2. `mo status --json` / `mo status --watch`

```json
{
  "host": "MacBook-Pro",
  "health_score": 92,
  "cpu": { "usage": 45.2, "logical_cpu": 8 },
  "memory": { "total": 34359738368, "used": 20078972109, "used_percent": 58.4 },
  "disks": [],
  "uptime": "3d 12h 45m"
}
```

The health score combines CPU, memory, disk capacity, SMART status, I/O,
thermals, battery state, and uptime. `--watch` emits one complete object per
line. Bound it and terminate.

### 3. `mo history --json [--limit N]`

Returns `logs` (paths of the operations and deletions logs) plus `sessions[]`
with `command`, `started_at`, `items`, `size`, and an `actions` breakdown of
removed / trashed / skipped / failed.

### 4. `~/.config/mole/clean-list.txt`

Written by `mo clean --dry-run` only — every candidate path. Read this file
rather than the terminal summary when you need to reason about or show exactly
what a real run would remove. `mo purge --dry-run` and
`mo installer --dry-run` write no file.

## Config, cache, and log paths

```
~/.config/mole/whitelist            # mo clean --whitelist
~/.config/mole/whitelist_optimize   # mo optimize --whitelist
~/.config/mole/whitelist_checks
~/.config/mole/purge_paths          # mo purge --paths
~/.config/mole/clean-list.txt       # last `mo clean --dry-run` candidates
~/.cache/mole/                      # update_message, version_check,
                                    # installed_apps_cache, permissions_granted,
                                    # pkg_receipt_apps_v1
~/Library/Logs/mole/operations.log  # mo history reads this
~/Library/Logs/mole/deletions.log   # one TSV line per deletion
```

Default purge scan dirs when `purge_paths` is unset: `~/Projects`, `~/GitHub`,
`~/dev`. Once custom paths exist, only those are scanned.

## Environment variables

### User-facing

| Var | Effect |
|---|---|
| `MO_DEBUG=1` | same as `--debug`; `[MODULE] message` to stderr |
| `MO_NO_OPLOG=1` | disable operation logging |
| `MOLE_OPLOG_PATH` | override the operation log path |
| `MO_USE_FIND` | force `find` instead of `fd` |
| `MO_LAUNCHER_APP=<name>` | terminal used by the Raycast/Alfred launchers |
| `MOLE_ENABLE_DISK_VERIFY=1` | enable the disk verify that `optimize` skips by default |
| `MOLE_VERSION` | target version for `install.sh` |
| `NO_COLOR` | honored by `install.sh` |

### Development / test only — do not surface to end users

`MOLE_DRY_RUN=1` (every safe-remove logs and returns 0 without touching the
filesystem), `MOLE_TEST_NO_AUTH=1` (refuses sudo / `osascript` / `launchctl`;
required for bats), `MOLE_TEST_MODE=1`, `MOLE_SKIP_MAIN=1`,
`MOLE_ASSUME_SUDO_AUTH=1`, `MOLE_TEST_ANALYZE_BIN`, `MOLE_TEST_STATUS_BIN`,
`MOLE_REQUIRE_ATTESTATION`, `MAX_RELEASE_MINOS` (default `13.0`).

### Tuning knobs that exist in source

`MOLE_ORPHAN_AGE_DAYS`, `MOLE_LOG_AGE_DAYS`, `MOLE_TEMP_FILE_AGE_DAYS`,
`MOLE_CRASH_REPORT_AGE_DAYS`, `MOLE_GPU_CACHE_AGE_DAYS`,
`MOLE_SAVED_STATE_AGE_DAYS`, `MOLE_CLAUDE_VM_ORPHAN_AGE_DAYS`,
`MOLE_TM_BACKUP_SAFE_HOURS`, `MOLE_TIMEOUT_*` (centralized in
`lib/core/timeouts.sh`), `MOLE_INSTALLER_SCAN_MAX_DEPTH`,
`MO_PURGE_SCAN_TIMEOUT_SEC`, `MOLE_MAX_PARALLEL_JOBS`,
`MOLE_PURGE_DEFAULT_SEARCH_PATHS`, `MOLE_PURGE_TARGETS`, `MOLE_CONFIG_DIR`,
`MOLE_USER_HOME`.

## Quick launchers (Raycast / Alfred)

```bash
curl -fsSL https://raw.githubusercontent.com/tw93/Mole/main/scripts/setup-quick-launchers.sh | bash
```

Installs launchers for Clean, Uninstall, Optimize, Analyze, and Status. Raycast
needs one manual step: Settings → Extensions → Script Commands, add
`~/Library/Application Support/Raycast/script-commands`, then run **Reload
Script Directories**. Terminal auto-detection covers Terminal, iTerm2,
Alacritty, kitty, WezTerm, Ghostty, Hyper, WindTerm, and Warp.

## Skill helper (read-only)

```bash
bash .agent-skills/mole/scripts/mole.sh doctor
bash .agent-skills/mole/scripts/mole.sh surfaces
bash .agent-skills/mole/scripts/mole.sh json status
bash .agent-skills/mole/scripts/mole.sh json analyze ~/Library
bash .agent-skills/mole/scripts/mole.sh json history 20
```

`json` refuses any subcommand other than `status`, `analyze`, and `history` —
it cannot be used to trigger a deletion.
