# CI and releases

Release mechanics, the checks `pnpm validate` runs, and CI. [AGENTS.md](../AGENTS.md) "Pull requests
and releases" states which commit types release and which files release-please owns.

## Releases

- release-please never lets you pick the version. To force an exact one, dispatch the workflow by
  hand: `gh workflow run release-please.yml --ref main -f release_as=X.Y.Z`, which must be higher
  than `.release-please-manifest.json`. Never push an empty `Release-As` commit to `main`.
- The dispatch runs the release-please CLI (pinned in `package.json` to the version the action
  bundles), not the action: release-please-action v5 silently drops `release-as` in manifest mode,
  which this repo's `release-please-config.json` selects.
- The override is one-shot: the next push to `main` re-derives the version and rewrites the release
  PR, so merge it promptly. A pin that survives pushes is `"release-as"` in
  `release-please-config.json`, through a PR, removed once released.
- Merging the release PR tags `skills-vX.Y.Z`, titles the GitHub release `skills: vX.Y.Z`, rewrites
  `CHANGELOG.md`, `version.txt`, and `.release-please-manifest.json`, and publishes the GitHub
  release.
- `.github/workflows/publish-changelog.yml` then posts the notes to the public changelog at
  [scenario.com/changelog](https://www.scenario.com/changelog). It hangs off the
  `release: published` event, not the release-please run, because release-please reports a created
  release exactly once. Re-run a failed post from the Actions tab, or dispatch it by tag.
- Because release-please owns `CHANGELOG.md`, it sits in `.prettierignore`, where it also keeps
  prettier from rewriting release-please's `*` bullets. It also sits in cspell's ignorePaths, as a
  guard should the spell-check globs widen; `scripts/check-spelling.sh` does not reach it today.
- In `.release-please-manifest.json`, exactly `0.0.0` is the sentinel for "no release yet": it makes
  `initial-version` and the root `bootstrap-sha` apply. Editing it to match `initial-version` looks
  like a sync fix and silently changes the first release number.
- The release PR title (`chore: release skills X.Y.Z`) passes commitlint because an omitted scope
  only warns.
- The `skills-` tag prefix matches the sibling repositories' convention. It is set by hand as
  `component` plus `include-component-in-tag` in `release-please-config.json`, because
  `release-type: simple` derives none, unlike `release-type: node`, which takes one from the
  `package.json` name.
- Changing the tag format orphans release-please from its own history unless the existing tag and
  its GitHub release move with it. The next changelog then replays every commit since
  `bootstrap-sha`.

## Checks

Each command is defined once in `package.json`. Most run a script in `scripts/`; `format` and
`format:check` invoke prettier directly. The pre-commit hook runs `pnpm validate`, and CI runs each
of its checks as a separate step:

- **`pnpm style`**: house style, the frontmatter contract, the body budget, the `AGENTS.md` size
  cap, and the near-cap, fan-out, table-cell, sentence-length, and wording notices.
  - It fails a frontmatter key other than `name`, `description`, and `license: MIT`, and a
    description of 500 characters or more (past 1024 for expert tools). It counts code points, as
    `pnpm groupings` does, and parses with `yaml`, so it needs `pnpm install` first.
  - It prints a notice, never a failure, for a body within 100 words of the 2500-word cap: two PRs
    that each pass can still push a skill past it together.
  - It counts body words under `LC_ALL=C.UTF-8`. GNU `wc` under `LC_ALL=C` skips a word made only of
    non-ASCII characters (a lone `→`), so an unpinned count drifted between machines.
  - It prints a notice, never a failure, once `AGENTS.md` passes 30 KiB, ahead of the 32 KiB cap.
- **`pnpm format:check`**: prettier.
- **`pnpm sync:agent-commands:check`**: the command links and metadata (see
  [agent-commands.md](agent-commands.md)).
- **`pnpm skill-files`**: supporting files next to a SKILL.md are linked and runnable, a skill's own
  `README.md` excepted.
- **`pnpm lint:py`**: ruff over every Python script, configured in `ruff.toml`, the vendored dev
  skills excluded.
  - The pyflakes rules, plus SIM115 for a file opened outside a `with` block. A handle no `with` can
    hold, such as a lock returned to its caller, carries `# noqa: SIM115` and the reason.
  - S110 for an `except` whose body is only `pass`. A comment beside the `pass` does not satisfy it:
    a deliberate one carries `# noqa: S110` and the reason on the `except` line.
  - Expert scripts that predate S110 keep a per-file waiver with their count of hits, never a
    per-folder one, so a new file is checked. `ruff.toml` says how to review and recount them.
- **`pnpm groupings`**: every skill sits in a `skills.sh.json` grouping, every listed skill exists,
  and the file satisfies the published skills.sh schema.
- **`pnpm manifest:check`**: the plugin marketplace manifest matches `skills.sh.json`.
- **`pnpm bugbot:check`**: `.cursor/BUGBOT.md` is a regular file identical to `REVIEW.md`. Cursor
  Bugbot reads a symlink as its target path, so the copy is generated: edit `REVIEW.md`, never the
  copy, and run `pnpm bugbot` (the pre-commit hook does).
- **`pnpm readme`**: the README Skills section mirrors `skills.sh.json`, one subsection per grouping
  in the same order with the same title, description, and rows, and every skill has exactly one
  non-stale row. It also checks the install commands (see AGENTS.md "Adding a skill").
- **`pnpm words:check`**: `project-words.txt` is sorted and deduplicated.
- **`pnpm spell`**: cspell.
- **`pnpm spec`**: spec validation of every skill, in one `uv run` (a `uvx` call per skill took over
  100 s). `SPEC_STAGED_ONLY=1`, set by the pre-commit hook, limits it to skills with staged changes
  and skips uv when there are none.

A commit hook runs with git's location variables (`GIT_DIR`, `GIT_INDEX_FILE`, and the rest)
pointing at this repository, and hook steps read the index through them.

- Never unset them for the whole hook.
- A tool a step runs that issues its own git commands must run without them, as
  `scripts/validate-skills.sh` does for uv: from a linked worktree, uv's inherited git commands
  reset the worktree's branch and set `core.bare` on this repository.

### Formatting

- prettier enforces formatting with the config committed in `.prettierrc.json`, so the CLI and the
  VS Code extension agree. `pnpm format` rewrites the repo; `pnpm format:check` only verifies.
- Coverage: everything prettier can parse (markdown, JSON, YAML, JS/TS), plus shell scripts via
  `prettier-plugin-sh`, which formats with mvdan-sh, the engine behind shfmt. `.prettierignore`
  excludes generated files and the vendored dev skills.
- Markdown prose wraps at 100 columns (`proseWrap: "always"`), so a GitHub diff shows the changed
  lines rather than one paragraph-long line.
- SKILL.md files and `.claude/` agents and commands also set `embeddedLanguageFormatting: "off"`. It
  is the one setting that stops prettier folding a frontmatter `description` across lines, so the
  description stays on the one line `pnpm style` reads and every skill has shipped with. Their
  fenced code is therefore left as written.
- A merged commit that only reformats, like the one that introduced the wrap, goes in
  `.git-blame-ignore-revs` so blame skips it.

## CI

- `scripts/test-skill-scripts.sh` runs each Python test module, and each vitest suite, as a job of
  its own, one per CPU at a time (`SKILLS_TEST_JOBS` overrides the count).
  - So a test module never depends on another's side effects, and writes only under a temporary
    directory.
  - Python test modules sit at the top of `tests/<name>/`. A nested `test_*.py` fails the run, since
    no job would pick it up.
  - Each job prints one status line with its duration as it ends, then its full log once all end,
    failures last.
- `script-tests` runs once on `ubuntu-24.04` and once on `ubuntu-26.04`, which install ffmpeg 6.1
  and 8.0 from apt.
  - Each runner is the coverage for one ffmpeg version, so both stay named, never `ubuntu-latest`.
  - When a newer LTS runner ships, add it as a new entry rather than renaming an existing one.
  - The runner's apt mirror sometimes stalls for half an hour, so each leg caches its ffmpeg .debs.
    The key hashes the exact package list, so an Ubuntu update downloads only what changed.
  - The job stops after 20 minutes, against a normal run under 5, so a stall fails fast.
  - Never hardcode a count derived from a probed duration in a test. ffmpeg 8 reports an MP3's
    gapless duration, while 6.1 and 7.1 include the encoder padding.
  - The `ubuntu-24.04` leg runs with `COVERAGE=1` and posts the Python table to its job summary. The
    vitest table stays in the step log.
  - Coverage spans core skills only (`.coveragerc`). Expert-tool scripts mostly run inside their
    host application, which coverage.py cannot follow.
  - Both reports list every core script, a file no test runs at 0%. coverage.py needs
    `include_namespace_packages`, since skill script folders hold no `__init__.py`. vitest takes the
    JavaScript and TypeScript of every core skill shipping some, suite or not.
  - It reports without a threshold, so a drop never fails CI.
- Python CI installs `tests/requirements-ci.txt` with hash checks and wheels only.
  `SKILLS_TEST_USE_SYSTEM_PYTHON=1` keeps tests and coverage in that verified environment. Local
  runs still resolve each suite's `requirements.txt` through uv. After changing a suite's
  requirements, regenerate the lock:

  ```bash
  uv pip compile --generate-hashes --python-version 3.12 --python-platform linux \
    tests/*/requirements.txt tests/coverage-requirements.in -o tests/requirements-ci.txt
  ```

  Blender's separate job uses a smaller lock. Regenerate it with:

  ```bash
  uv pip compile --generate-hashes --python-version 3.12 --python-platform linux \
    tests/scenario-blender-expert/requirements.txt \
    -o tests/scenario-blender-expert/requirements-ci.txt
  ```

  The browser job's lock adds Playwright for Python to the playable-ads requirements. Regenerate it
  with:

  ```bash
  uv pip compile --generate-hashes --python-version 3.12 --python-platform linux \
    tests/scenario-playable-ads/requirements.txt \
    tests/scenario-playable-ads/requirements-browser.in \
    -o tests/scenario-playable-ads/requirements-browser-ci.txt
  ```

  The Blender core job's `bpy` lock targets Python 3.13, the only version `bpy` 5.x ships wheels
  for. Regenerate it with:

  ```bash
  uv pip compile --generate-hashes --python-version 3.13 --python-platform linux \
    tests/scenario-patina-retexture/requirements.txt \
    tests/scenario-patina-retexture/requirements-bpy.in \
    -o tests/scenario-patina-retexture/requirements-bpy-ci.txt
  ```

  Add `--upgrade-package <name>` when updating a locked package without changing its requirement.

- `browser.yml` runs the suites that skip without a real browser: the playable-ads QA run on the
  shipped template (`test_qa.py`) and the motion-loops page checks and render.
  - The in-process suites reach those scripts through stand-ins (a fake Playwright, a fake page), so
    this job is the one check against a real Chromium.
  - It triggers only on changes to those skills, their tests, the Playwright locks, or itself.
  - Python takes Playwright from `requirements-browser-ci.txt`. Node takes it from the kinetic
    scaffold's `assets/npm` lock, the repository's one locked npm Playwright. Keep both on the same
    release, so one Chromium build serves them.
  - A skip fails the job, since a skipped suite means the browser never started.
- `blender-core.yml` runs the core skills' Blender-hosted scripts in a real Blender: blender-2d's
  `build_scene.py` and orbit-views' `render_grounded.py` through the binary, patina-retexture's
  pipeline through the `bpy` module.
  - The `script-tests` suites reach those scripts through a stand-in `bpy`, and coverage.py cannot
    follow into Blender, so this job is the one check that they still run in Blender.
  - It triggers only on changes to those scripts, their tests, or the Blender setup.
  - It installs Blender through `.github/actions/install-blender`, shared with `blender.yml`. Keep
    both workflows on the same `BLENDER_RELEASE`.
  - A skip fails the job, since a skipped suite means Blender or `bpy` never started.
- `upload-coverage` sends both Cobertura reports to GitHub code coverage (part of Code Quality),
  which shows each PR's percentage against `main`.
  - It needs code coverage enabled in the repository's Code Quality settings.
  - Fork PRs skip it: their token cannot hold `code-quality: write`.
  - Separate labels (`code-coverage/python`, `code-coverage/vitest`) keep the two reports apart.
- Dependabot (`.github/dependabot.yml`) proposes one grouped PR a week per ecosystem, for releases
  at least seven days old:
  - `ci(deps)` for GitHub Actions;
  - `chore(deps)` for the npm dev tooling in `pnpm-lock.yaml` and the kinetic music-video and
    kinetic film scaffolds' `assets/npm/package-lock.json`;
  - `chore(deps)` for the Python requirements and CI locks in `tests/` and `tests/*/`. It raises the
    floors too, since advisory scanners such as OpenSSF Scorecard read a requirement's lower bound,
    not the version CI installs.
  - the kinetic film scaffold's `assets/requirements.txt` in the same Python group: its pins must
    equal `tests/requirements-ci.txt` (a test checks), and a bump of that shipped file releases only
    under a `fix` PR title.
  - It skips release-please-action and the `release-please` CLI, which move by hand together: the
    `package.json` pin must stay the version the action bundles.
  - `pr-name-linter` skips its PRs. A group holding one dependency gets a title past the
    120-character header cap, and `dependabot.yml` sets only the prefix. Its commit messages stay
    short and still pass the `commitlint` job.
- The kinetic music-video scaffold uses `npm ci` with its shipped package lock. Keep `opentype.js`
  on 1.x while the engine's import map names `dist/opentype.module.js`. Version 2 renamed that
  module to `dist/opentype.mjs`. Dependabot ignores major updates for this dependency until the
  import map is migrated.
- `scorecard.yml` publishes the OpenSSF Scorecard report, the README badge's source, on each push to
  `main`, weekly, and when branch protection changes. It also uploads the findings to code scanning.
  - It is never a required check.
  - Publishing rejects a workflow-level `env` or `defaults`, write permissions above the job, and
    actions outside upstream's approved list in the job.
- `codeql.yml` runs CodeQL on every pull request, each push to `main`, and weekly.
  - The `main` ruleset requires its results, so it replaces default setup, which never analyzed fork
    PRs and left them blocked. Keep default setup off: it rejects uploads from a workflow.
  - Its `/language:<name>` categories match default setup's, so alert history carries over.
  - The C# job references Unity's managed assemblies, taken from the editor archive and cached.
    Without them, too few calls resolve and the status page flags low C# analysis quality. Bump
    `UNITY_VERSION`, its revision, and its MD5 with the version the Unity skills document.
  - Code Quality still runs as GitHub's own analysis, but the ruleset does not require it: it never
    runs on fork PRs either.
- `links.yml` runs lychee over tracked Markdown, without the vendored dev skills and `CHANGELOG.md`:
  - on every pull request, the relative links and anchors of every file offline, since moving any
    file, Markdown or not, can break a link to it;
  - on a pull request that changes Markdown, then every link of the changed files, so a dead
    external link elsewhere never blocks it;
  - weekly, and on dispatch, every link.
  - `lychee.toml` lists the hosts and patterns it skips, each with its reason.
  - GitHub notifies a failed scheduled run only to whoever last changed its `cron` line.
