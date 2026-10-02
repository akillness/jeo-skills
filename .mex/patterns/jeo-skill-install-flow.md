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
last_updated: 2026-10-02
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
  `INSTALL_GLOBAL=false` never writes global Jev; an explicit backend mode fails
  preflight and points to standalone `jev/jev-setup.sh`. The full-mode guide uses
  that same guarded installer rather than hand-copying a second implementation.
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
