---
name: jeo-skill-install-flow
description: How the jeo-skill router CLI resolves a skill selection and delegates the actual install to npx skills add — use when adding a CLI filter/flag, debugging a bad install, or explaining what jeo-skill install actually does.
triggers:
  - "jeo-skill install"
  - "jeo-skill CLI"
  - "npx skills add"
  - "install flow"
  - "bundle install"
edges:
  - target: "context/architecture.md"
    condition: "for how this flow fits the rest of the repo"
  - target: "context/setup.md"
    condition: "for the exact commands and environment variables involved"
  - target: "patterns/catalog-metadata-changes.md"
    condition: "when a bundle/category referenced here needs a metadata change instead"
grounds_to: []
last_updated: 2026-10-21
---

# jeo-skill Install Flow

## Context
`.agent-skills/jeo-skill/scripts/jeo-skill.py` is the lightweight catalog router
distributed as its own installable skill (see `install.sh`). It is intentionally
outside this project's `.mex/graph.db` index (only 12 root-level tooling files are
indexed — see `context/architecture.md`), so this pattern is grounded in direct source
reading, not `mex://` node ids — treat any code citation below as read-verified, not
graph-verified.

Browse the manifest, select skill names, then delegate transport to the pinned skills
CLI. Required GJC/Aside/Antigravity native projections reuse `install_support.py`;
never infer runtime loading solely from an upstream agent label or successful exit.

## Steps
1. **Catalog resolution** (`load_catalog()`) tries, in order: `$JEO_SKILLS_CATALOG` env
   var, `<script>/../../skills.json` (source checkout), `./.agent-skills/skills.json`
   (cwd), then falls back to downloading
   `raw.githubusercontent.com/akillness/jeo-skills/main/.agent-skills/skills.json` and
   caching it at `~/.cache/jeo-skill/skills.json`. An installed copy (under
   `~/.agents/skills/jeo-skill/...`) deliberately does *not* walk up further than its
   own script — that would risk finding an unrelated legacy `.agent-skills` checkout.
2. **Selection resolution** (`resolve_install_selection()`): starts from explicit
   `names`, extends with `bundles[<bundle>]` if `--bundle` was passed, extends with
   `filtered_skills(category, subcategory, interface)` if any of those filters were
   passed, de-duplicates, and errors if the result is empty. Any name not found in the
   manifest is checked against `retired_skills` first — a retired name gets a helpful
   `"retired: old->new (mode)"` message instead of a bare unknown-skill error.
3. **Command construction** uses pinned `skills@1.7.0`, `--copy --full-depth`, and
   scope-aware runtime aliases. jeopi/JEO/OMP share `.agents/skills`; GJC's session
   loader rejects shared providers and needs its native root. AGY means Antigravity
   CLI, not the desktop IDE. Aside is account-scoped and is not an upstream target.
4. **Execution** previews selection and command, validates safe destinations, delegates
   transport, then verifies selected files and applies only required native projections.
   Multiple Aside accounts require an explicit choice; user/builtin content is preserved.
5. **Bootstrap** always invokes the router just installed in the requested scope.
   Test macOS Bash 3.2: an empty array expansion under `set -u` can fail even after `=()`.
6. **Retired-skill cleanup** (2026-10-21): `install_support.RETIRED_INSTALLS` maps each
   retired catalog name to its replacement and the catalog copy's exact first `# ` heading
   (`jeo` → `ooo`, `harness` → `harness2`). `finish_install` removes fingerprint-matched
   copies from the install and projection roots after verification; `install --dry-run`
   reports `would-remove`; `prune-retired [--global] [--dry-run]` sweeps every runtime root
   (shared, Claude, Pi, Crush, OpenCode, GJC, Antigravity CLI/IDE, Aside `skills/user`) and
   `install.sh` calls it after bootstrap. Keep `RETIRED_INSTALLS` and manifest
   `retired_skills` in sync when retiring a name whose copies were ever installed.

## Gotchas
- `--dry-run` only ever proves the *selection* and the *command string* are correct — it
  never touches the filesystem, so it cannot catch problems that only `npx skills add`
  itself would hit (network, target-runtime path resolution, etc.).
- Explicit `JEO_SKILLS_CATALOG` paths must fail closed in every catalog command;
  only an unset override permits discovery. Test missing files, directories, bad
  JSON, and successful overrides through subprocesses, including `doctor`.
- `doctor` and real installs share Node.js 22.20+/npx checks. A failed or ten-second
  hung Node version check must yield an actionable error, not success or a traceback.
  Browsing and dry-run remain usable without Node/npx; `linked` is informational.
- Passing more than 12 skill names without `-y`/`--yes` is a hard error by design —
  don't "fix" this by scripting `--yes` blindly; it exists to force a human to look at a
  large selection first.
- `jeo-skill.py` has no local fallback if `npx` is missing — the CLI raises
  `JeoSkillError("npx is required to install skills")` rather than trying anything else.
- `jeo-skill link` refuses to overwrite an existing `~/.local/bin/jeo-skill` that isn't
  already a symlink to this exact script, unless `--force` is passed — this protects a
  user's own unrelated `jeo-skill` binary from being silently replaced.
- `skills@1.7.0` sends global targets with project `skillsDir=.agents/skills` to the
  canonical shared root, even if its registry advertises another global directory.
  Verify actual materialization; AGY global installs require a native projection.
- Actual runtime probes must use a fresh process with fixture HOME at process start.
  Bun caches home state; changing `process.env.HOME` in an already-running process
  does not reliably isolate all runtime loaders. Provider discovery alone is also
  insufficient: GJC filters non-native skills later in its session loader.
- Shell syntax validation does not prove preview safety. `bash install.sh
  JEO_SKILLS_DRY_RUN=true` passes `bash -n` but treats the assignment as an argument,
  not an environment variable. Put assignments before `bash` and exercise the exact
  documented preview in an isolated, no-network fixture with a no-write assertion.
  Public upgrade examples must use a documented checkout root, not a maintainer's
  absolute or `~/.superset` workspace path.
- Jev is a separate home-scoped opt-in, not a catalog installation prerequisite.
  `JEO_SKILLS_JEV=skip` and unset non-interactive bootstraps never fetch/configure it.
  `INSTALL_GLOBAL=false` never writes global Jev; an explicit backend mode warns,
  skips optional Jev, and points to approved standalone `jev/jev-setup.sh`. The full-mode guide uses
  that same guarded installer rather than hand-copying a second implementation.
- Jev non-blocking behavior (2026-10-12): invalid modes, project-scoped opt-in,
  temporary-file allocation, download, and optional setup failures warn without
  rolling back verified skills. Genuine skill transport or verification failures remain errors.
  Packaged Claude, jeopi, OMP, and Pi hooks use independent private profiles;
  copying assets is not provider registration. New config-only profiles start OFF,
  while ordinary approved setup retains its explicit opt-in semantics. Native hooks
  use a trusted installed snapshot, never an arbitrary working-directory catalog.
  Evidence: `test_installer_regressions.py` 48/48, `test_jev_regressions.py` 64/64,
  isolated-HOME plugin integration (not runtime activation), fail-closed unavailable
  backends, and catalog preservation. Session-load plans use verified host argv;
  persistent package toggles require registration, separate from `JEV_ENABLED`.
  Provider/model advice does not grant permissions or replace a host model automatically.
- Jev `status` distinguishes configuration from readiness: exit 2 is inactive
  (normal host policies), exit 3 is invalid/configured unavailable (fail closed).
  Health/model-list success is not inference or native-hook enforcement proof.
  Use `jev/README.md` and `scripts/test_jev_regressions.py` for the current contract.
- Jevgrep is independent of Jev and is not a metadata-search dependency. The optional
  `explore` subcommand requires an explicit root and per-call `--allow-remote` before
  invoking manually installed `@dzhng/jevgrep@0.8.0`; credentials alone are not consent.
  Dry-run dispatches before catalog loading and needs neither `jg` nor credentials.
  Preserve literal query/root/exclude argv, reserved-subcommand rejection, no-cache,
  bounded concurrency/requests/output, timeout and child stream/status propagation.
  Keep graph traversal and checkpoint writes with their existing owners. `jg files`
  is a local counts-only preview; `jg doctor` calls a provider and must not run implicitly.
  Verification: `python3 scripts/test_jevgrep_regressions.py -v` covers the wrapper;
  a real pinned-package loopback smoke covers transport, not live model quality.
- Retired cleanup must stay fingerprint-gated: same-named third-party skills (revfactory's
  own `harness` H1 differs), trees containing links, and roots behind a linked ancestor
  (checked with `require_safe_path` from the HOME/project boundary) are `kept`/`skipped`.
  A retired-name symlink is unlinked only if its realpath is a dir the same batched sweep
  removed; `finish_install` therefore sweeps install + projection roots in ONE call (a
  per-root sweep would delete the target first and then keep the dangling link). Do not
  recommend `npx skills remove` for
  stale `.skill-lock.json` entries: skills@1.7.0 deletes same-named dirs across all agent
  roots without any fingerprint check. Report stale lock entries instead.
- Real-HOME dry-run on 2026-10-21 found retired copies in ten roots (shared, Claude, Pi,
  Crush, OpenCode, GJC, both Antigravity roots, Aside) plus one symlinked Crush `harness`
  that is correctly kept; the user's actual installation was not swept by this change.
- Real-HOME full setup (2026-10-21): `skills list -g` hung past 300 s with no output, while
  `skills list -g -a universal --json` returned in ~4 s; use the scoped form for Step 7.
  The sweep does not cover `~/.augment/skills` or `~/.hermes/skills`; both held
  fingerprint-matched retired copies (`jeo`, `harness`) that `skills list` still reports.
- On this macOS host, `uv tool install 'semble[mcp]'` (uv-managed CPython 3.13) is blocked
  by library validation: syspolicyd rejects and then deletes `orjson`'s `.so`, so the CLI and
  `uvx --from 'semble[mcp]' semble` (Codex's MCP command) fail. The Homebrew-Python venv at
  `~/.local/share/semble-venv` works. Do not leave a broken semble tool install on PATH.
- Aside mirror copies keep Aside-owned `.skill_id` files; compare mirrored content
  excluding them. `~/.config/opencode/skills` can hold older catalog copies that shadow the
  shared root at higher precedence; the guide does not refresh that root.

## Live public setup verification

- Execute exact published fences with real pinned npm/Git transport in an isolated
  HOME/XDG/NPM/UV environment and OS write containment; never inherit provider secrets.
  Private npm/UV bin paths are isolation adaptations, not permission to silently add
  the router's new `~/.local/bin` to PATH. Preserve fence bytes and ordinary-shell status.
- Judge installation by file/hash parity, hooks/config preservation and fresh real
  loader/MCP responses, not exit 0. Label reused tools, absent-account skips, blocked
  deployment branches and separately corrected diagnostic runs individually.
- Prove GJC shared-only rejection before native projection. Seed synthetic Aside
  account directories only for mirror-placement tests; they are not authenticated accounts.
- macOS system Python 3.9 satisfies the guide's baseline but not fresh Semble/Ouroboros
  dependencies. Explicit `--python 3.13` installations were verified. Ouroboros 0.55.7
  `[all]` pins MCP 1.28.1 while its server needs MCP 2; a separate `[mcp]` environment
  initialized successfully. Do not combine contradictory `[all,mcp]` requirements.
  The `python3 -m pip install --user` fallback also cannot satisfy this release on
  system Python 3.9; require a compatible interpreter instead of treating it as recovery.
- The 2026-10-12 audit reproduced `rtk init -g` leaving the hook unregistered without
  `--auto-patch`, Step 7 bare-router PATH errors, and unsupported README `--project` flags.
  Corrected diagnostics do not turn the original published guide into a pass.
  Core/minimal fences contain the same link-then-bare-router pattern; their failure
  under the same missing-PATH condition is inferred from source, not a separately executed mode.
- Semble CLI `--help` selects CLI mode; no-argument `semble` selects MCP. Test the
  exact registered argv with initialize/tools-list; this does not prove search/model readiness.

- Durable audit report: `~/vaults/llm-wiki/wiki/reports/2026-10-12-public-full-setup-audit-81131733.md`;
  verbatim logs and hashes: `~/vaults/llm-wiki/raw/sources/audits/2026-10-12-public-full-setup-81131733/`.

## Verify
- [ ] `jeo-skill doctor` reports `"ok": true`, a resolved `catalog` path/URL, and
      `"linked": true`
- [ ] `jeo-skill install <names> --dry-run` prints the exact expected `npx skills add`
      command before running it for real
- [ ] A retired skill name produces a `retired: X->Y` message, not a generic
      "unknown skill" error

## Debug
- **"No local catalog or usable cache, and remote catalog download failed"**: no source
  checkout, no cwd `.agent-skills/skills.json`, no prior cache, and the network fetch
  failed — set `JEO_SKILLS_CATALOG` explicitly or run from inside the repo checkout.
- **Install silently does nothing observable**: check for `--dry-run` in the command
  history first — it's a common accidental leftover flag.
- **"Selection is larger than 12 skills"**: expected safety rail; either narrow the
  selection or pass `--yes` deliberately.
- **Linux permission preservation fails while macOS passes**: do not capture
  `stat -f ... || stat -c ...` as one value. GNU `stat -f` can emit filesystem
  details before failing, polluting the mode. Match the existing Darwin/GNU
  dispatch and keep exact mode-preservation assertions in both CI jobs.

## Update Scaffold
- [ ] Update `.mex/ROUTER.md` "Current Project State" if the install flow's behavior changed
- [ ] Update `.mex/context/architecture.md` if `resolve_install_selection()` or
      `install_command()`'s contract changed
