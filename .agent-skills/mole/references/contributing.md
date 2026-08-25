# Mole — contributing to the repo

Read `AGENTS.md` in the checkout before editing anything. `CLAUDE.md` is a
symlink to it, so Claude Code and Codex get the same contract. Machine-local
overrides belong in `AGENTS.local.md` / `CLAUDE.local.md` (both gitignored).

## Stack and layout

Bash CLI (`mole` router + `bin/` orchestrators + `lib/`) plus two Go/Bubble Tea
TUI binaries. `go.mod` is `github.com/tw93/mole`, Go `1.25.0`; direct deps are
`bubbletea`, `lipgloss`, `gopsutil/v4`, `xxhash/v2`, `golang.org/x/sys`.
There is no `package.json`, `Cargo.toml`, or Tauri config — the GUI is a
separate closed-source product.

```
mole                 CLI entrypoint — ROUTER ONLY (parse args, menu, dispatch)
mo                   alias -> exec mole
bin/                 command orchestrators: clean.sh, uninstall.sh, optimize.sh,
                     purge.sh, installer.sh, completion.sh, touchid.sh,
                     history.sh, analyze.sh + status.sh (3-line launchers for
                     the Go binaries)
lib/core/            base.sh, file_ops.sh (the deletion funnel),
                     app_protection.sh + app_protection_data.sh (data only),
                     ui.sh, log.sh, sudo.sh, timeouts.sh, bundle_resolver.sh,
                     pkg_receipts.sh, help.sh, commands.sh
lib/clean/           dev.sh, user.sh, apps.sh, app_caches.sh, project.sh,
                     system.sh, caches.sh, brew.sh, hints.sh, purge_shared.sh
lib/uninstall/       batch.sh, brew.sh, steam.sh
lib/optimize/        tasks.sh, catalog.sh, diagnostics.sh, maintenance.sh,
                     outcomes.sh
lib/manage/          update.sh, whitelist.sh, remove.sh, purge_paths.sh
lib/ui/              menu_paginated.sh, menu_simple.sh, app_selector.sh
cmd/analyze/         Go TUI — main.go (bootstrap), model.go (types),
                     update.go (Bubble Tea Update chain), scanner.go,
                     cache.go, delete.go, view.go, json.go, insights.go
cmd/status/          Go TUI — view.go, metrics*.go, diagnosis.go, prefs.go,
                     process_watch.go, watch.go
internal/units/      bytes.go
scripts/             check.sh, test.sh, setup-quick-launchers.sh,
                     check_release_minos.sh, audit_bundle_drift.sh,
                     audit_function_duplication.py
tests/               bats suites + fuzz corpora
docs/                SECURITY_DESIGN.md, release-notes/
```

`VERSION=` stays in `mole` because `install.sh` reads it out with `sed`.
Business logic never belongs in `mole` itself.

## Setup and build

```bash
git clone https://github.com/tw93/Mole.git && cd Mole
brew install shfmt shellcheck bats-core golangci-lint
go install golang.org/x/tools/cmd/goimports@latest
git config core.hooksPath .githooks

make build           # -> bin/analyze-go, bin/status-go (current arch)
make release-amd64   # -> bin/{analyze,status}-darwin-amd64
make release-arm64   # -> bin/{analyze,status}-darwin-arm64
make clean
```

Release builds are `CGO_ENABLED=0` on purpose, so the macOS SDK on the release
runner cannot raise the Mach-O minimum OS version via cgo.
`scripts/check_release_minos.sh` gates release binaries at minos ≤ 13.0.

Run a TUI without installing: `go run ./cmd/analyze`, `go run ./cmd/status`.

## Verify

```bash
./scripts/check.sh --format                     # make format
./scripts/check.sh --no-format                  # make check
MOLE_TEST_NO_AUTH=1 ./scripts/test.sh           # make test (full bats suite)
go test ./...                                   # make test-go
MOLE_TEST_NO_AUTH=1 bats tests/clean_core.bats  # targeted
MOLE_DRY_RUN=1 ./mole clean
MOLE_TEST_NO_AUTH=1 ./mole clean --dry-run
find bin lib -name '*.sh' -print0 | xargs -0 -n1 bash -n
```

`make verify` runs `check` + Go tests **only** — run the full bats suite before
risky cleanup, uninstall, or release work.

Never pipe a test, check, or CI run into `tail` or `head`: the pipeline reports
the pager's exit code, so a red run reads green.

Stale `golangci-lint` cache after deleted worktrees:

```bash
golangci-lint cache clean && golangci-lint run ./cmd/...
```

## The rules that block a PR

- **Route deletions through `mole_delete` / `safe_remove` / `safe_sudo_remove`
  in `lib/core/file_ops.sh`.** Raw `rm -rf` needs an inline
  `# SAFE: <one-sentence reason>` on the same line, and CI checks for it. Do
  not route a `mktemp` scratch path through `mole_delete` — that adds Trash
  routing and an operation-log entry to a temp file.
- **Never modify protected paths** such as `/System`, `/Library/Apple`, or
  `com.apple.*`.
- **Verification must never block on sudo, AppleScript, or macOS
  authorization** unless the task is specifically about auth. Use
  `MOLE_TEST_NO_AUTH=1`; any new direct `sudo` / `osascript` / `launchctl`
  needs a `MOLE_TEST_MODE` / `MOLE_TEST_NO_AUTH` guard or a full mock.
- **A new cleanup target needs measured value and an explicit non-target
  list.** State bytes actually reclaimable on a real app version, name the
  sibling directories excluded as user data, and prove protection covers every
  reachable path. "It looks like a cache" is not evidence.
- **Leftover matching stays exact** — bundle ID or app-name variants only.
  Reject generic words, keep short-name floors, skip broad locations, and only
  remove helper remnants after the parent app is confirmed gone.
- **Homebrew cleanup must be preview-first** and must never execute real
  package-manager removals during verification.
- **PRs touching destructive sinks get line-by-line review** —
  `find_app_files`, `mole_delete`, `remove_file_list`, container traversal,
  identifier-prefix wildcards, or any recursion ending in deletion. Treat
  specialist or AI review output as a claim to verify, never as approval.

## Shell style

Bash **3.2** compatible (that is what macOS ships), 4-space indent,
`set -euo pipefail`, quote every variable, `[[ ]]` not `[ ]`, `snake_case`
functions, and **BSD not GNU** command flags (`stat -f%z`, not
`stat --format`). Keep formatting via `./scripts/check.sh --format`.

Two traps worth memorizing:

- **A bare `[[ ... ]]` inside a `run ... bash <<'EOF'` heredoc asserts
  nothing.** `set -e` does not abort a script bash reads from stdin, so only
  the heredoc's last command decides `$status`. End every in-heredoc assertion
  with `|| exit 1`, or `printf` the value and assert on `$output`.
- **Do not add a shell-side directory size cache.** APFS does not propagate
  mtime up the tree, so a parent's mtime is unchanged when a descendant grows;
  the cache would hand the user a stale reclaimable number.

When adding or changing a guard test, prove it fails: break the code it
protects, watch it go red, then restore. A green test is not evidence until it
has been seen red.

## Hotspot ownership

These files are intentionally large — do not start by splitting them. Keep
edits narrow and run the listed tests.

| Area | Owner file | Tests |
|---|---|---|
| user-level cleanup, browser caches | `lib/clean/user.sh` | `clean_user_core`, `clean_browser_versions`, `clean_app_caches` |
| uninstall/data/path protection policy | `lib/core/app_protection.sh` | `uninstall_safety`, `uninstall_naming_variants`, `bundle_resolver` |
| purge discovery and config | `lib/clean/project.sh` | `purge`, `purge_config_paths` |
| uninstall orchestration | `bin/uninstall.sh` | `uninstall`, `uninstall_scan_bash32` |
| batch uninstall, sibling guard, brew cask | `lib/uninstall/batch.sh` | `uninstall`, `brew_uninstall`, `uninstall_remove_file_list` |
| dev-tool and AI-agent caches | `lib/clean/dev.sh` | `clean_dev_caches`, `dev_extended` |
| optimize task registration | `lib/optimize/tasks.sh` | `optimize`, `optimize_db` |
| clean orchestration and section output | `bin/clean.sh` | `clean_core`, `clean_apps`, `cli` |
| self-update and self-heal | `lib/manage/update.sh` | `update` |
| the deletion funnel | `lib/core/file_ops.sh` | `file_ops_mole_delete`, `file_ops_size`, `file_ops_safe_remove_symlink`, `user_file_ops`, `core_safe_functions` |
| installer discovery and delete plan | `bin/installer.sh` | `installer`, `installer_fd`, `installer_zip` |
| analyze Update chain / scanner / cache | `cmd/analyze/{update,scanner,cache}.go` | `go test ./cmd/analyze` |
| status rendering | `cmd/status/view.go` | `go test ./cmd/status`, `cli` |
| shared Bash 3.2 selection UI | `lib/ui/menu_paginated.sh` | `menu_trap_restore`, `uninstall` |

Prefix bats runs with `MOLE_TEST_NO_AUTH=1`.

## Release flow

Three channels:

| Channel | Ships | Trigger |
|---|---|---|
| Nightly (`mo update --nightly`) | `main` HEAD via `install.sh` | any commit to `main` |
| GitHub release | amd64/arm64 binaries + `SHA256SUMS` + attestation | pushing a **capital-`V`** tag |
| homebrew-core | version-bump PR to `Formula/m/mole.rb` | the same `V*` tag workflow |

```bash
git push origin main
git tag V<version>
git push origin V<version>
```

Lowercase `v` tags are ignored by `release.yml`. Release notes are curated
bilingually (EN + 中文) afterwards via `gh release edit` —
`generate_release_notes` is off.

## Repo conventions

- Do not add AI attribution trailers to commits.
- Keep CLI issues and Mole Mac app issues separate; a fix in one does not close
  the other.
- `.claude/skills/` is the canonical home for project skills;
  `.agents/skills/` holds relative symlinks for Codex discovery. Do not
  maintain copied skill bodies.
- Judge duplication by function body, not by name —
  `scripts/audit_function_duplication.py` hashes normalized bodies and runs
  inside `check.sh`.
- Before declaring a symbol dead, grep `lib`, `bin`, `cmd`, `scripts`,
  `tests`, and the top-level entry/install scripts, and check dynamic lookup
  through `eval`, `declare -f`, and `compgen`.
