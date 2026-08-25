---
name: mole
description: >
  Drive Mole (`mo`), tw93's GPL-3.0 macOS maintenance CLI that cleans caches
  and app leftovers, uninstalls apps with their remnants, purges rebuildable
  project artifacts, removes downloaded installers, explores disk usage, runs
  bounded system optimization, and reports live health. Routes one request to
  one mode: run a command safely (`--dry-run` first, the user runs the
  destructive step), consume the JSON/NDJSON agent surfaces (`mo analyze
  --json`, `mo status --json` / `--watch`, `mo history --json`,
  `~/.config/mole/clean-list.txt`), install/update/remove on the right channel,
  configure whitelists and scan paths, troubleshoot, or contribute to the repo.
  Use when a user wants to free Mac disk space or fully uninstall a Mac app.
  Triggers on: mole, `mo clean`, `mo uninstall`, `mo analyze`, `mo purge`,
  `mo status`, tw93/Mole, mole.fit, clean my Mac, what is eating my disk,
  CleanMyMac / AppCleaner / DaisyDisk alternative, brew install mole.
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: >
  macOS only (10.14+, Intel and Apple Silicon); `install.sh` hard-fails on
  non-Darwin. Windows support is an experimental `windows` branch. Needs the
  stock Bash 3.2+ and admin rights for some cleanup. Full Disk Access is
  recommended, not required. Optional `fd` speeds up `purge`/`installer`.
  Go 1.24+ only to build the `analyze`/`status` TUI binaries. The CLI is
  GPL-3.0; the "Mole for Mac" GUI at mole.fit is a separate paid product.
metadata:
  tags: mole, macos, cleanup, uninstaller, disk-analyzer, system-monitor, cli, tui, maintenance, homebrew, go, bash
  platforms: Claude, ChatGPT, Gemini, Codex
  version: "1.0"
  source: https://github.com/tw93/Mole
---

# Mole — macOS cleanup, uninstall, analyze, optimize, monitor

Mole is a terminal-first macOS maintenance toolkit: a Bash CLI (`mole`, aliased
`mo`) plus two Go/Bubble Tea TUI binaries (`analyze-go`, `status-go`). It
reclaims disk space, removes apps together with their remnants, purges
rebuildable project artifacts, and reports system health — with dry-run
previews, path protection, and an operations log on every destructive path.

**It deletes files on someone's live machine.** That single fact drives every
rule below.

## When to use this skill

- A user wants to free disk space, find what is eating their disk, or fully
  uninstall a Mac app including leftovers
- Reading Mole's machine-readable output (`--json` / `--watch` / the dry-run
  list file) instead of scraping a TUI
- Installing, updating, or removing Mole, or untangling a Homebrew-vs-script
  install-channel conflict
- Configuring whitelists, purge scan paths, shell completion, or Touch ID
- Diagnosing a Mole run that skipped everything, hung, or asked for permissions
- Contributing to the `tw93/Mole` repo (Bash 3.2 + Go, bats tests, the
  `# SAFE:` deletion contract)

## When not to use this skill

- Non-macOS cleanup, or Linux/Windows disk tooling → Mole is Darwin-only
- Questions about the paid **Mole for Mac** GUI (mole.fit) → separate
  closed-source product, not this repo; the CLI is not a feature mirror of it
- Generic "delete these files for me" work with no Mole involved → use plain
  shell; do not route arbitrary deletions through Mole
- Package management, app installation, or background monitoring → explicitly
  out of scope per the project's own product filter

## Instructions

### Step 0: The five rules (non-negotiable)

These come from the project's own agent guide
(`.claude/skills/mole/SKILL.md` upstream) and override convenience:

1. **Preview before you delete. Always.** Every destructive command takes
   `--dry-run`. Run it, show the user what would go, then offer the real run.
   The dry-run *is* the undo.
2. **The user runs the destructive command, not you** — unless they asked for
   it in this turn. "Clean my Mac" is such an ask; "why is my disk full" is not.
3. **Never parse a TUI frame.** `mo analyze` and TTY-attached `mo status` are
   full-screen Bubble Tea programs whose output is drawn, not printed. Use the
   JSON surfaces.
4. **Never invent flags.** The surface is small. If it is not in
   `references/commands.md`, run `mo <command> --help`. There is no `--yes`
   and no `--force` on the cleanup commands.
5. **Protection is a whitelist, not an argument.** To keep a cache, use
   `mo clean --whitelist` — never a hand-rolled `find`/`rm` around the safety
   layer.

### Step 1: Pick exactly one mode

| Mode | Use when | Go to |
|---|---|---|
| `run-command` | the user wants space freed, an app gone, projects purged | Step 2 |
| `automate` | you need data: disk map, health, what was deleted | Step 3 |
| `install-update` | install, update, nightly, remove, channel conflict | Step 4 |
| `configure` | whitelist, purge paths, completion, Touch ID, launchers | Step 5 |
| `troubleshoot` | permissions, "did nothing", missing binary, recovery | Step 6 |
| `contribute` | editing the `tw93/Mole` repo itself | Step 7 |

### Step 2: `run-command` — map the question to one command, preview, hand over

| The user asks | Command |
|---|---|
| "What is eating my disk?" | `mo analyze --json` (or scope it: `mo analyze ~/Library --json`) |
| "Free up space" | `mo clean --dry-run` → review → `mo clean` |
| "Remove this app completely" | `mo uninstall --dry-run <app>` → `mo uninstall <app>` |
| "My Mac feels slow" / caches look broken | `mo optimize --dry-run` → `mo optimize` |
| "Clean up my old projects" | `mo purge --dry-run` → `mo purge` |
| "Get rid of downloaded installers" | `mo installer --dry-run` → `mo installer` |
| "What did Mole delete?" | `mo history --json --limit 20` |

Two things to say out loud before a real run:

- **`mo clean` and `mo purge` delete permanently.** `mo uninstall` and
  `mo analyze` route through Trash. Say which one applies.
- **`mo optimize` is the destructive command whose effect is not "files
  disappear"** — it flushes DNS, rebuilds Finder/icon caches, and touches
  system services. Describe what it will do first.

For `mo purge`, distinguish locally rebuildable output (`target/`, `build/`,
`dist/`, `.next/`) from network-restorable dependencies (`node_modules/`,
`Pods/`, `venv/`, `vendor/`). The second kind is not recoverable offline.

### Step 3: `automate` — use the four machine-readable surfaces

```bash
mo analyze --json ~/Library     # one JSON object: entries[], large_files[], totals
mo status  --json               # one health snapshot
mo status  --watch --interval 1s  # NDJSON stream — BOUND IT, then terminate
mo history --json --limit 20    # sessions[] + the log paths
cat ~/.config/mole/clean-list.txt  # every candidate from the last `mo clean --dry-run`
```

`~/.config/mole/clean-list.txt` is written by `mo clean --dry-run` only.
`mo purge --dry-run` and `mo installer --dry-run` print candidates to the
terminal and write no file.

`mo status` auto-switches to JSON when stdout is not a TTY, but pass `--json`
explicitly in scripts so intent stays obvious. Never leave `--watch` running
unbounded in the background.

Schemas and flags: `references/commands.md`.
Read-only helper: `bash .agent-skills/mole/scripts/mole.sh doctor`.

### Step 4: `install-update` — pick the channel and stay on it

```bash
brew install mole                                                    # homebrew-core
curl -fsSL https://raw.githubusercontent.com/tw93/mole/main/install.sh | bash   # script
```

Channel rules that cause most install failures:

- `install.sh` **refuses** when it detects a Homebrew-owned install. Use
  `brew upgrade mole`, or `brew uninstall --force mole` first.
- `mo update --nightly` is **script-install only**. Homebrew users upgrade
  with `brew upgrade mole`.
- The positional token `latest` is a **legacy alias for `main`** — it installs
  unreleased code, not the newest stable release. Pass a real tag
  (`1.51.0` / `V1.51.0`) if you want a pinned release.
- Installing to the default `/usr/local/bin` prompts for an admin password on
  every update. `--prefix "$HOME/.local/bin"` keeps future `mo update`
  password-free.

`install.sh` is fail-closed: a checksum or attestation mismatch aborts and says
why; it never silently downgrades to a source build. Do not work around that.

Uninstall Mole itself with `mo remove` (`--dry-run` supported).

### Step 5: `configure` — everything is a file under `~/.config/mole/`

```bash
mo clean --whitelist        # protected caches      -> ~/.config/mole/whitelist
mo optimize --whitelist     # protected maintenance -> ~/.config/mole/whitelist_optimize
mo purge --paths            # scan dirs             -> ~/.config/mole/purge_paths
mo completion               # auto-detect shell and install
mo touchid enable|disable|status
```

Default purge scan dirs when `purge_paths` is unset: `~/Projects`, `~/GitHub`,
`~/dev`. Once custom paths are configured, **only** those are scanned.

Optional Raycast/Alfred launchers:

```bash
curl -fsSL https://raw.githubusercontent.com/tw93/Mole/main/scripts/setup-quick-launchers.sh | bash
```

Environment knobs (full list in `references/commands.md`): `MO_DEBUG=1`,
`MO_NO_OPLOG=1`, `MOLE_OPLOG_PATH`, `MO_USE_FIND`, `MO_LAUNCHER_APP`,
`MOLE_ENABLE_DISK_VERIFY=1`.

### Step 6: `troubleshoot` — check the four usual causes first

1. **Permissions.** Most "it skipped everything" reports are TCC. Grant Full
   Disk Access to the terminal app in System Settings; Trash failures may also
   need App Management or App Data.
2. **"Bundled analyzer binary not found."** `bin/analyze-go` / `status-go` are
   missing — reinstall or `mo update`.
3. **Channel conflict.** See Step 4; `install.sh` refusing a Homebrew install
   is intentional.
4. **"Did Mole take my file?"** Do not guess. `mo history --json` names the
   deletions log; every deletion is one tab-separated line (timestamp, mode,
   size, status, path). Read the actual line, then add the path to
   `mo clean --whitelist` so the next run leaves it alone.

Add `--debug` to any command when it silently did nothing. Do not leave it on.

Known limits and the full protection model: `references/safety.md`.

### Step 7: `contribute` — the safety contract is the review gate

```bash
git clone https://github.com/tw93/Mole.git && cd Mole
brew install shfmt shellcheck bats-core golangci-lint
git config core.hooksPath .githooks
make build                                  # -> bin/analyze-go, bin/status-go
./scripts/check.sh --format
MOLE_TEST_NO_AUTH=1 ./scripts/test.sh
go test ./...
```

Read `AGENTS.md` in the repo first — `CLAUDE.md` is a symlink to it and it is
the cross-agent source of truth. Hard rules: route deletions through
`mole_delete` / `safe_remove` in `lib/core/file_ops.sh`; raw `rm -rf` needs an
inline `# SAFE: <reason>` annotation that CI checks for; Bash 3.2 compatible
with BSD (not GNU) command flags; never let verification block on a real sudo
or `osascript` prompt — use `MOLE_TEST_NO_AUTH=1`.

Details and hotspot ownership: `references/contributing.md`.

## Best practices

1. **Dry-run, then hand the keyboard back.** The preview is the only step the
   user can veto, and for `mo clean` / `mo purge` it is the only undo.
2. **Read `~/.config/mole/clean-list.txt`, not the terminal summary**, when you
   need to reason about or show exactly what a real `mo clean` would remove.
3. **Say which deletion mode applies** before every real run: permanent
   (`clean`, `purge`, `installer`) vs Trash (`uninstall`, `analyze`).
4. **Never scrape the TUI.** `--json` / `--watch` exist precisely so you do not
   have to; a drawn frame is not a stable interface.
5. **Bound `--watch`.** Collect the samples the question needs, then terminate.
   Never leave a monitor running in the background.
6. **Stay on one install channel.** Homebrew and script installs do not mix,
   and `--nightly` only exists on the script channel.
7. **Whitelist instead of narrowing the command.** Mole's protection lists are
   the supported way to spare something; hand-rolled deletion around them
   loses path validation, Trash routing, and the operations log.
8. **Do not run `mo update` on a user's behalf** unless they asked — and never
   `--nightly`, which installs unreleased `main`.
9. **Trust the refusals.** "When Mole cannot prove an item is safe to change,
   it skips or refuses it." A skip with a reason is the product working, not a
   bug to route around.

## References

- [references/commands.md](references/commands.md) — every command, flag, JSON schema, env var, and config/log path
- [references/safety.md](references/safety.md) — the 5-layer protection model, protected prefixes and bundles, undo/Trash semantics, audit logs, known limitations
- [references/contributing.md](references/contributing.md) — build, test, release flow, the `# SAFE:` contract, Bash 3.2 rules, hotspot ownership
- [scripts/mole.sh](scripts/mole.sh) — read-only `doctor` / `surfaces` / `json` helper; never deletes, installs, or updates
- [Mole repository](https://github.com/tw93/Mole) · [mole.fit](https://mole.fit) (paid GUI, separate product)
- Upstream agent contract: [AGENTS.md](https://github.com/tw93/Mole/blob/main/AGENTS.md) · [SECURITY.md](https://github.com/tw93/Mole/blob/main/SECURITY.md) · [docs/SECURITY_DESIGN.md](https://github.com/tw93/Mole/blob/main/docs/SECURITY_DESIGN.md)
- Project standards: `.agent-skills/skill-standardization/SKILL.md`

## Examples

### Example 1: "Why is my disk full?" — read-only, no deletion offered

```bash
bash .agent-skills/mole/scripts/mole.sh json analyze ~/Library
```

Report the largest `entries[]` and any `insight: true` rows. Do **not** chain
into `mo clean` — the user asked a question, not for a cleanup.

### Example 2: "Clean my Mac" — preview, show, then hand over

```bash
mo clean --dry-run
cat ~/.config/mole/clean-list.txt
```

Summarize the candidate list by category and total size, warn that `mo clean`
deletes permanently, then let the user run `mo clean` themselves.

### Example 3: Fully uninstall an app

```bash
mo uninstall --list                 # exact name Mole accepts
mo uninstall --dry-run slack        # review app + leftovers
mo uninstall slack                  # routes through Trash
```

### Example 4: Short diagnostic time series

```bash
mo status --json                              # one snapshot
timeout 10 mo status --watch --interval 1s    # ~10 NDJSON lines, then stop
```

### Example 5: Check the environment before recommending anything

```bash
bash .agent-skills/mole/scripts/mole.sh doctor
bash .agent-skills/mole/scripts/mole.sh surfaces
```

`doctor` reports macOS/arch, whether `mo` is installed and by which channel,
version, config/log presence, and optional `fd` — without installing,
updating, or deleting anything.
