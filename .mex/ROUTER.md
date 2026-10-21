---
name: router
description: Session bootstrap and navigation hub. Read at the start of every session before any task. Contains project state, routing table, and behavioural contract.
edges:
  - target: context/architecture.md
    condition: when working on system design, integrations, or understanding how components connect
  - target: context/stack.md
    condition: when working with specific technologies, libraries, or making tech decisions
  - target: context/conventions.md
    condition: when writing new code, reviewing code, or unsure about project patterns
  - target: context/decisions.md
    condition: when making architectural choices or understanding why something is built a certain way
  - target: context/setup.md
    condition: when setting up the dev environment or running the project for the first time
  - target: context/catalog-pipeline.md
    condition: when the task touches skills.json, SKILL.md frontmatter, README/TOON projections, or CI catalog validation
  - target: patterns/INDEX.md
    condition: when starting a task — check the pattern index for a matching pattern file
last_updated: 2026-10-21
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Working:**

- Root `.gitignore` allowlist (2026-10-21, user-chosen): everything at the repository root
  is ignored unless it has a `!/name` line (`.agent-skills/` plus the published install,
  docs, CI, changelog, jev, scripts and mex surface). Untracked, local copies kept:
  `python/bin/*` (stray venv binaries), `test_parse.ts`, `run_python.js`, `pr-body.md`.
  Side effect: the old unanchored `llm-wiki/` rule matched `.agent-skills/llm-wiki/`, so new
  files there were silently ignored; root `/llm-wiki/` is now covered by `/*` instead.

- README/visual refresh 2 (2026-10-21): English/Korean/Spanish READMEs now document skill
  usage tracking (`usage`, `prune-unused`, `restore`, `purge-quarantine`, maintainer
  `retire-unused-skills.py` with a required Jev review choice), 18 operator preflights, and the
  corrected host split: Claude Code loads native `~/.claude/skills`, not the shared root (also
  fixed in `setup-all-skills-prompt.md` Step 3/4D). Duplicate `ooo` docs merged, gti/plannotator
  commands fixed, EN structure fence closed. New visuals: Codex cover `assets/readme-cover.webp`
  (gti private-codex) and Codex-authored `catalog-install-flow.svg`, `runtime-boundaries.svg`,
  `skill-lifecycle.svg`; old cover/diagrams and the orphan `assets/scrapingant/` logo deleted.
  Root `CHANGELOG.md` gained 2026-10-15 and 2026-10-21. Runbook:
  `patterns/readme-visual-refresh.md`.

- harness2 replacement and four operators (2026-10-21): `harness` (revfactory) retired to
  `harness2` (google-research/harness2 @ `1cfe254e`, Apache-2.0; agent-team design moved to
  its method mode, every route-out repointed); added `ruflo`, `voicestudio`,
  `diagram-design`, `artcraft` as commit-pinned operators with offline preflights (catalog
  369 → 373 locally, 405 after merging upstream's 401; new groups `agent-harness-optimization`, `voice-generation`,
  `diagram-authoring`, `generative-scene-studios`, `agent-swarm-runtimes`). Installs now
  remove fingerprint-matched stale catalog copies of retired `jeo`/`harness`
  (`install_support.RETIRED_INSTALLS`, `jeo-skill prune-retired`, `install.sh`, setup guide
  Step 4E). Evidence: installer 63/63 (vendored `scripts/fixtures/retired-skills/*.fixture`,
  no git history needed), preflight 15/15 with `TMPDIR=/private/tmp/...`, catalog gates
  pass; documented full install (Steps 4–4E, 7) passed end to end with real skills@1.7.0 in
  an isolated HOME seeded from this machine's stale copies, sourced from a committed local
  snapshot via a git `insteadOf` redirect (public HEAD not yet pushed), with real
  jeopi/OMP/GJC loader probes (OpenCode: placement only); upstream harness2 demo 2/2 in both
  modes + unit 5/5 in an isolated clone. Jev (jeopi, api,
  unvalidated) routed the task and returned `proposal_only` on the cleanup review. Real
  HOME (user-approved, 2026-10-21): the five new skills were installed from the local
  checkout into the shared root, GJC and Antigravity CLI only, and 11 retired entries were
  removed after a backup at `~/.agents/.jeo-quarantine/retired-20261021160539/`. The five
  copies also added to `~/.claude/skills` and Aside (outside the approved scope) were
  removed again. There is no APFS snapshot, so "absent before the run" rests on the
  session-start skill inventory, the names' absence from git history and Aside state before
  today, and exact file-set equality with the repo. A same-named file that differed would
  have been overwritten unrecoverably at install time. The installed router (`~/.local/bin/jeo-skill`) is still the old
  build without `prune-retired`, and `.skill-lock.json` still lists `jeo`/`harness`.
  Runbooks: `patterns/jeo-skill-install-flow.md`, `patterns/catalog-metadata-changes.md`.

- Skill usage tracking + unused-skill cleanup (2026-10-21, interview-approved D1-D12):
  `jeo-skill usage scan|report|keep|unkeep|relevance`, `prune-unused` (preview read-only;
  `--apply` rescans, Jev review gate or recorded skip, reversible quarantine), `restore`,
  `purge-quarantine`; maintainer `scripts/retire-unused-skills.py` for catalog retirement.
  Logic lives in `skill_usage.py`/`skill_quarantine.py`/`skill_jev.py`/`skill_usage_cli.py`;
  `jeo-skill.py` only registers/dispatches. Jev hooks append `jev-usage.jsonl` (injected vs
  routed). Scans are single-flight (`scan.lock` flock; `usage scan --if-idle` skips) and
  re-parse live records when the catalog changes, carrying forward rows for skills absent
  from the current catalog. Claude stores include every `CLAUDE_CONFIG_DIR` profile (active,
  `JEO_SKILL_CLAUDE_CONFIG_DIRS`, or remembered), merged by max with linked stores read
  once. Cursor copy-dedup needs size + full SHA-256 (shared 4 KiB headers no longer merge
  distinct transcripts). `prune-unused --apply` refuses when any present store failed to
  read. Evidence: usage 13, quarantine 16, retirement 7 Python tests and
  4 node ledger tests pass; Jev runtime/codex/lifecycle 64 pass; catalog gates pass;
  installer-side end-to-end: the INSTALLED `jev-plugin.mjs` hook (offline stub backend)
  wrote a 0600 ledger line without prompt text and the INSTALLED `jeo-skill usage scan`
  counted it as `jev` use. That check exposed an outage: the asset refresh had published a
  mid-merge `jev-plugin.mjs` with a duplicate import (SyntaxError on every host hook);
  republished, and `jev-setup.sh` now `node --check`s every staged `*.mjs` before publishing
  (install.test 20/20; the new case fails on the previous setup).
  installer 63/63. The earlier `/var` TMPDIR failures were a test-fixture alias mismatch, fixed
  in the merge (`test_installer_regressions.py` resolves its owned temp root); the suite now
  passes 63/63 with the default macOS TMPDIR and in CI run 39569222853 (Ubuntu + macOS).
  Applied on this machine (user-approved): installed router reinstalled from the checkout
  (byte-identical scripts); `~/.agents/jev` assets + catalog snapshot refreshed via
  `jev-setup.sh --config-only --profile jeopi --mode api` (profile/key preserved); real
  tracking started at `~/.local/state/jeo-skill` (tracking_started_at 2026-10-21T08:21Z,
  catalog 405: 221 used, 184 with no observed use, first grace end 2026-11-20); Claude
  `SessionEnd` scan hook added to `~/.claude/settings.json` and the orca
  `CLAUDE_CONFIG_DIR` profile (backups `settings.json.bak-jeo-usage-20261021T172420`);
  daily LaunchAgent `~/Library/LaunchAgents/com.jeo-skills.usage-scan.plist` (03:17,
  kickstart run exit 0). Both pin `JEO_SKILLS_CATALOG` to this checkout when present.
  A test-isolation leak once wrote fixture rows into the real state dir; it was wiped
  before the clean first scan and current suites leave it untouched. Nothing has been
  quarantined or retired. Runbook: `patterns/skill-usage-lifecycle.md`.

- UI-design repositories (2026-10-16): added ten original exact-source operators and
  the ui-design-repositories bundle (390 to 400 skills), with immutable source/license
  references, a ten-source audit and 45 authored scenarios (not executed evaluations).
  Six offline packaging/router regressions pass; CI runs them on Ubuntu/macOS.
  No existing skill is superseded or retired; Canvas UI has restricted redistribution,
  Hyperiux tooling/effects licenses differ, and Cursify has no observed license grant.
  No upstream runtime was installed or executed. Exact-SHA publication evidence is
  recorded outside the repo; source/packaging checks are not browser/runtime proof.

- macOS preflight CI fixture repair (2026-10-16): the first post-Jev CI run
  passed catalog/Ubuntu and native Jev checks on both platforms, then exposed
  test-owned `/var` temp aliases rejected by strict source-path guards. Resolve
  only the owned TemporaryDirectory base in the regression fixture, not any
  caller-provided repo path. Added a deterministic aliased-temp-base regression;
  existing root/parent/leaf symlink rejection tests and production helpers remain
  unchanged. The new regression failed before the fixture fix.

- Jev host-model planning repair (2026-10-16): implemented the missing
  `--host-models` input rather than weakening the existing CI tests. Plans now
  intersect advice with a same-agent/profile observation no older than 60 seconds,
  exact authenticated model membership and eligible provider/model quotas. OAuth
  identities remain distinct. Strict calendar validation, post-read/final freshness
  checks and bounded regular-file JSON inputs cover the review findings. New
  isolated CLI regressions exercise invalid inputs and deterministic clock advances.
  This is source/advisory behavior only: no real credentials, providers, installed
  runtime settings or host models were changed; remote CI remains a separate gate.

- Knowledge repositories (2026-10-16): added 18 original source-pinned operators
  for the reviewed ontology, code-graph, memory and retrieval projects. The
  `knowledge-repositories` bundle covers 21 projects by reusing unchanged `mex`,
  `obsidian-second-brain` and `okf-agent-memory`; the catalog now contains 390 skills.
  Each new guide has a selected-public-file SHA256 manifest, a standalone no-Git
  preflight and six authored evaluation scenarios (108 total, not model-quality
  execution evidence). Source-only reviews covered all 18 guides; the OCI/stdio
  declaration in Open Ontologies was corrected separately from source-build commands.
  New subprocess regressions run in the Ubuntu/macOS installer CI matrix. These
  offline checks do not install upstream runtimes, verify complete revisions or
  activate providers/MCP/services. OrionBelt is BSL 1.1 with a restricted production
  use grant, not MIT; individual references preserve the other license boundaries.

- Publication preparation (2026-10-15): reconciled the upstream OKF addition and
  retained the 368-skill catalog. Focused Python 31, Node 28 and all eight README
  verification groups pass locally; remote CI is a separate gate. Unattributed
  Jev plugin and September archive deletions remain outside the publication.

- README/visual refresh (2026-10-14): English, Korean and Spanish authored docs
  now use the Codex cover and source-accurate catalog/runtime SVGs; eight obsolete
  README-only assets were removed. Monthly release sources and generated windows
  are synchronized. Eight focused check groups and fourteen isolated preview
  commands passed; 850px browser renders had no SVG text overflow. The pre-existing
  missing root LICENSE remains a licensing open item. Runbook:
  `patterns/readme-visual-refresh.md`.

- Measured source performance/resource audit (2026-10-14): safe native YAML parsing,
  fresh bounded query metadata, streaming hashes/env/GLB/log reads, and encoder/browser
  failure cleanup now have isolated regression coverage. Targeted local suites and
  catalog gates passed; the new suites are wired into installer CI, not remotely run.
  Catalog projections and installed/global runtime settings were unchanged.
  Reproduction and remaining limits: `patterns/performance-resource-audit.md`.

- Jev CI timeout fixture repair (2026-10-14): latest OpenCode/setup publication
  `bda3e7c7` exposed an Ubuntu-only race in the native SIGTERM/SIGKILL regression.
  Fixture readiness now follows handler installation; fake deadline/grace timers
  verify each stage while real process death remains checked. Production timeout
  behavior is unchanged. Six-way concurrent targeted repetitions passed 18/18;
  the 118-case native suite passed with one intentional live skip.

- Jev runtime integration (2026-10-14): Codex profile configured ON with assist
  skill injection and advisory PreToolUse review; both merged hook definitions
  are trusted according to the installed Codex app-server. Actual new Codex
  sessions recognized the selected installed React skill and received a live
  `proposal_only` review before one successful read-only command. Installed
  harness now matches source and accepts rounded probabilities. Native Pi-family
  assist callbacks inject trusted skill bodies and prune only older Jev-owned
  messages. Explicit Codex enforce mode denies nonvalidated/unavailable reviews
  and never grants host permissions. See `context/jev-runtime-activation.md`.

- Jev README/source/installed audit (2026-10-14): fresh self-test 20/20,
  Python Jev 64/64, installer 48/48 and Node 53 pass/1 live skip. Actual installed harness still
  uses strict probability-sum validation; loopback sum 0.99 succeeds in source
  but fails installed. Legacy API is configured but unverified/unvalidated;
  Codex has no saved profile and exposes adapter-only plans. Native callback
  performs routing advice only, not automatic prune/review/action enforcement.
  See `context/jev-readme-audit.md`; no installed settings/product code changed.
- Funded TypeSafe review (2026-10-12): one real API-only POST returned HTTP 200
  through the current source harness; `jev-latest` served `jev-1.13.0`, four Noul
  answers passed strict validation, usage was 435 input / 80 output tokens, and
  caller-visible latency was 340 ms. Result `proposal_only` reflects two
  below-threshold answers; this is transport/contract evidence, not calibration,
  skill-routing quality, or an autonomous-permission attestation. Keychain secret
  stayed in child environment/private memory; profiles were unchanged. Evidence:
  `~/vaults/llm-wiki/raw/sources/audits/2026-10-12-typesafe-live-review-a9bf469a/evidence.json`.
- Public FULL setup audit (2026-10-12): public ref `81131733` stayed unchanged;
  authentic GitHub/npx transport installed 367 manifest-matching SKILL.md files in
  isolated HOME. Actual jeopi/jeo/OMP loaders passed; GJC rejected shared-only skills
  and passed after native projection. Synthetic Aside-account mirroring preserved
  its unrelated sentinel; this proves placement, not authenticated app activation.
  Original guide is not an end-to-end pass: PATH, non-interactive RTK hook,
  Python selection and Ouroboros `[all]`/MCP 2 incompatibilities were reproduced;
  separate diagnostic corrections passed. Step 6 GJC guidance and README `--project`
  examples remain inconsistent. Durable report: `~/vaults/llm-wiki/wiki/reports/2026-10-12-public-full-setup-audit-81131733.md`;
  original evidence: `~/vaults/llm-wiki/raw/sources/audits/2026-10-12-public-full-setup-81131733/`.
  No public guide/README patch or push was made by this audit; deployment/model
  execution and fresh Linux/Windows setup are not claimed.

- The catalog manifest (`.agent-skills/skills.json`, 405 skills) and its three
  projections (`.agent-skills/skills.toon`, `README.md`/`README.ko.md`/`README.es-ES.md`
  category tables, each skill's own SKILL.md frontmatter) are validated end-to-end by
  `scripts/validate-catalog-projections.py`, wired into `.github/workflows/ci.yml`
  on every PR into `main`
- `filmcraft` adds source-pinned guidance for the Rust editor's headless CLI/MCP and
  desktop loopback bridge, with project-preservation, export and installer boundaries.
  Catalog search and selective-install dry-run resolve it; application build, editing,
  rendering and MCP operation were not exercised. Upstream pin and ten behavioral
  evaluation fixtures live in `.agent-skills/filmcraft/`.
- The frontmatter-freeze exception ledger ("Rule F") — `scripts/build_exception_ledger.py`
  builds it, `validate_frontmatter_frozen()` + a dedicated `--self-test-rule-f` CI step
  enforce it fail-closed
- The `jeo-skill` router (`.agent-skills/jeo-skill/`) — browse (`categories`, `list`,
  `search`, `related`) and selectively install with `jeo-skill install`, filterable by
  bundle, category, or subcategory, and previewable with `--dry-run`, without a full
  repo checkout; delegates real installs to `npx skills add`
- The flat `.agent-skills/<name>/SKILL.md` layout is enforced by
  `flatten_skills.py --dry-run` in CI (no category subfolders)
- OpenCreator repository operator (2026-10-17): added `.agent-skills/opencreator/` as
  the 13th source-pinned operator, audited at `krillinai/OpenCreator` commit
  `b01a9f71165b9010216e25c462653b0cfa33cbce`. It includes a pinned upstream
  reference, standalone read-only offline preflight, 11 authored eval fixtures, and
  dedicated subprocess CI regressions (16/16 passing locally). The helper checks
  source markers and local Git metadata only, makes no network call or configuration
  write, and always reports
  `runtime_verified: false`; no upstream runtime or installer was run. This raises
  the family total to 13 operators and 71 authored scenarios; the existing generic
  preflight suite still covers the prior twelve.
- Repository operators (updated 2026-10-15): twelve source-pinned guides for Openrig,
  AnyJev, TypeSafe computer use, Zurp, Helix Foundry, Uzu, Context Mode, REA, FineEnvs,
  llmfit, pg-jev, and Jev Ultrafast. The v1.1.0 packages use router-first SKILL.md,
  independent pinned `references/upstream.md`, standalone executable stdlib
  `scripts/preflight.py`, and 60 authored behavioral eval scenarios. The Jev Ultrafast
  operator is pinned to `browser-use/jev-ultrafast` commit
  `1231850a0bf1a0c0341fe408ef1668dbbfdfac46`; its preflight distinguishes local source
  and dependency metadata from browser, provider, and task readiness. The repository
  preflight suite covers all twelve helpers, including missing prerequisites, literal
  paths, source pins, copied-package portability, hostile Git environment/trace guards,
  and Jev Ultrafast symlink rejection. Git inspection binds the resolved source root
  and disables inherited selectors, prompts, global/system configuration and network
  protocols. CI runs the suite on its Ubuntu/macOS installer matrix. Offline status is
  not runtime activation, model quality, provider authorization or desktop/database
  execution proof. README locales/setup distinguish support-file copying from separately
  approved upstream operations. Context Mode is not an OS/security sandbox; npm
  postinstall can rewrite Claude configuration. Other catalog entries are inherited
  unchanged.
- OKF Agent Memory (2026-10-15): added a commit-pinned operator for the separate
  OKF v0.2 Go CLI/MCP project-memory tool, with a standalone read-only preflight,
  source-pinned setup/security references, routing evals, and explicit approval
  gates for install, bootstrap, writes, MCP registration and Git side effects.
  The generic `okf` skill remains the Google OKF v0.1 atom authoring/validation path;
  the source guide's Go 1.22+ claim conflicts with pinned `go.mod` Go 1.26.0.
- The `headroom` skill packages durable context routing with Graphify preflight and
  Ponytail policy guidance. Full delegated setup reuses healthy Headroom deployments;
  its source-mutation adapter is explicitly Claude Code-only.
- Frontmatter repair (`scripts/repair-skill-frontmatter.py`) recovers broken YAML
  descriptions from `skills.toon`/manifest/setup-prompt sources; the old regex-based
  `fix_frontmatter.py` is a deprecated shim that only delegates to it
- `scripts/generate-catalog-projections.py` is the inverse of the validator: it rewrites
  `skills.toon` and the three README skills-list sections surgically from the manifest
  (`--check` proves a regeneration is a byte-for-byte no-op). Adding a skill is now
  "edit skills.json, run the generator, run the validator" — no hand-derived TOON lines
- Five vendored upstream families (pm-skills 65+1, langchain-skills 10, higgsfield-ai
  8, k-skill 5, oh-my-gods 17) each carry a pinned upstream commit in the manifest's
  `relationship_groups` note and a README "References" row; the import provenance
  recipe is `patterns/catalog-metadata-changes.md` → "Task: Import an upstream family"
- Duplicate policy (2026-09-19): same-job skills are merged into one canonical skill and
  the old name goes into `retired_skills` (14 entries now); adjacent-but-different skills
  are declared as `relationship_groups` (30 groups) — see
  `patterns/catalog-metadata-changes.md` → "Task: Merge a duplicate skill"
- `setup-all-skills-prompt.md` Step 5 again wires the llm-wiki/graphify knowledge
  pipeline (`hooks/ingest-prompt.py` + per-agent `llm-wiki-ingest.sh` wrapper) — the
  2026-07-30 lightweight rewrite had dropped it while `llm-wiki/SKILL.md` still claimed
  it existed
- `shopping-shorts` is now promoted from the Aside-global account skill into the
  catalog as a portable evidence-first vertical-commerce video harness. Its 79-case
  `--media` regression suite passes, it belongs to `media-video`, and it is related to
  the `video-production` family
- Runtime installation now distinguishes shared jeopi/JEO/OMP discovery from GJC's
  native-only loader, Aside account roots, and Antigravity CLI/IDE roots. The router
  pins `skills@1.7.0` and verifies required native projections after shared transport.
  Real isolated installs passed 12 runtime/scope cases; actual jeopi/JEO/GJC/OMP
  session loaders resolved the expected installed files in both global and project scope.
  Aside/AGY verification covers installation placement, not authenticated app activation.
- Live installation audit (2026-10-01): configuration-writer24, installer31, and
  loader-probe6 checks pass, plus eight isolated actual-loader probes. Actual HOME
  still has the older shared/Aside/IDE router without `install_support.py`; GJC's
  native root lacks `jeo-skill`, and AGY CLI's native skill root is absent. Published
  GitHub source successfully upgrades a copy of this old shared installation in an
  isolated HOME. This does not update or prove activation of the real installation.
- Installation follow-up (2026-10-01): portable old-router preview/apply guidance
  and push/manual CI checks are complete. All 34 installer, 6 loader-probe, and
  24 configuration-writer tests passed. Exact documented GJC/AGY/IDE blocks preserve
  minimal/core/full selections; isolated real transport upgrade and doctor passed.
  Actual user installation and ECC settings remain unchanged.
- Remote CI exposed a Linux permission lookup bug: GNU `stat -f` emits filesystem
  output before failing, contaminating inline fallback capture. Agentation and the
  test mode helper now use the established Darwin/GNU dispatch; local 24 passed.
  Corrective commit 5a5bc6b7 passed catalog and both Ubuntu/macOS installer jobs
  in GitHub Actions run 36860045564.
- Router review hardening (2026-10-01): explicit catalog overrides now fail closed
  for browse/doctor as well as install; negative search limits are rejected; doctor
  and install share bounded Node/npx prerequisite checks. Installer39, loader6,
  config-writer24 passed locally. Real pinned npm transport passed six isolated
  runtime/scope placements (not runtime activation). This is a GitHub-distributed
  catalog, with no root npm build/publish target; nested manifests are templates.
- Context-layer lifecycle (2026-10-01) — IMPLEMENTED. Seed
  `.ouroboros/seeds/seed_ctx_lifecycle_20261001.yaml` (v1.0.1, 12 ACs) executed
  directly after the Ouroboros run was cancelled (its worktree containment drops every
  out-of-repo context reference, so it could never reach the vault/hooks). Global
  `ctx` tool at `~/.agents/hooks/ctx/` + `~/.local/bin/ctx`; triggers wired
  (Claude `TaskCompleted`/`SessionEnd`, this repo's `pre-push` chained before git-lfs);
  vault consolidated onto `~/vaults/llm-wiki` (settings/jeo/jeopi/Codex repointed, dead
  hooks removed, per-turn `graphify update` retired everywhere); mex-agent 0.8.3 with a
  schema-v4 rebuilt graph.db. Three real checkpoints ran (two push-triggered, one
  evidenced): 42.6 MB of regenerable legacy deleted, 27 authored pages + 2 foreign roots
  archived under `wiki/archive/`, 650 MB zvec daemon log rotated, graphify dead-source
  nodes 2867 → 0, raw/ byte-identical (1,440 files). 12/12 ACs pass
  (`.ouroboros/evidence/acceptance-run.txt`); hermetic `ctx test dryrun-noop` proves a
  dry-run changes zero bytes. Runbook: `patterns/context-layer-lifecycle.md`.
  `.ouroboros/` is gitignored by the user's `/.ouroboros/` rule — seed/research/evidence
  are not under version control.
- Published router hardening as `fef4b525` to origin/main. GitHub Actions run
  `36867473636` passed catalog and Ubuntu/macOS installer jobs. A fresh isolated
  remote bootstrap fetched the published router byte-for-byte, passed doctor, and
  installed responsive-design through real skills@1.7.0 into shared/GJC roots.
  Existing Actions Node20 deprecation warnings remain; npm registry publishing is
  not configured for this repository.
- Jev optionality (2026-10-02): root bootstrap and full-mode guide use canonical
  home-scoped setup only after opt-in. Skip/no-TTY unset performs no Jev fetch/write;
  project opt-in was originally rejected; the 2026-10-12 change below supersedes that policy.
  Status distinguishes configured opt-in from health/model-list readiness; outages
  and malformed decisions fail closed, uncertain context stays intact. A real
  source-harness Ollama prune returned `keep` without mock, downloads or setup changes.
  Host integration remains rule-driven, not automatic native-hook registration.
  README locales and both SVGs document that boundary; current commands live in
  `jev/README.md`. Existing user Jev installation and ECC settings were not updated.
- Jev non-blocking installation (2026-10-12): invalid modes, project-scoped opt-in,
  allocation, download, and optional setup failures warn and skip only Jev. Verified
  skills remain installed; genuine skill transport and verification errors still fail.
  The controller provides independent private profiles and packaged Claude, jeopi,
  OMP, and Pi advisory hooks. New config-only profiles start OFF; ordinary approved
  setup keeps its explicit opt-in semantics. OFF hooks skip stdin/catalog/backend/host
  work. Session loading is not persistent registration, and package maintenance is
  separate from the single profile authority `JEV_ENABLED`. Host-specific model plans
  are advisory and never executed automatically. Native hooks pin a trusted catalog;
  strict TypeSafe answers remain separate from local legacy wire support. Saved API
  keys are preserved; local-only writer plans cannot borrow ambient hosted secrets.
  Final evidence: installer 48/48, Jev 64/64, native/profile/plugin tests 53 passed
  plus one explicit live opt-in skip, and offline self-test 20/20. Standalone root
  controller and raw native leaf collisions preserve prior private bytes; actual
  OFF callbacks accept 1 MiB prompts without an unhandled EPIPE. The separate
  live Ollama smoke passed with probe status 200 and `backend_unavailable`, not a
  selected skill or model-quality claim. Release checks did not exercise paid API,
  DB or desktop execution; the later single hosted review is recorded above.
  Commands and boundaries: `jev/README.md`, `patterns/jev-control-plane.md`.
- Jevgrep discovery (2026-10-02): `jeo-skill explore` is a separate opt-in over an
  explicit source-document root; metadata search and native exact/LSP/zvec/Graphify
  routes remain defaults. Dry-run works before catalog loading without `jg` or
  credentials; execution requires per-call `--allow-remote` and manually installed
  `@dzhng/jevgrep@0.8.0`. Request/output bounds, no-cache and timeout are enforced.
  Twelve regressions passed; the published package completed skills/wiki/graph-source
  transport against deterministic loopback responses (12 POSTs, no cache/source writes).
   This proves transport, not live-provider retrieval quality. README locales, setup
   guide and both SVGs describe the boundary; `patterns/jeo-skill-install-flow.md`
   records recurring checks. No global install, authentication or graph rebuild occurred.
- CI test-job setup trim (2026-10-14): `test` job no longer installs Bun
   (`oven-sh/setup-bun` was unused — all four steps are pure Python) and pins
   `pyyaml==6.0.3`. Measured local script time is ~1.2 s total (validator 0.67 s,
   rule-f 0.08 s, frontmatter 0.42 s, flatten 0.05 s), so setup dominated the job.
   Installer-job suites measured ~137 s per OS (jev 52 s, installer 40 s, preflight
   19 s, node 12 s); top waits are intentional contract behavior (10 s hung-node
   bound, unreachable-backend probe timeouts), left unchanged.

**Not yet built:**
- `validate_links()` (dangling relative markdown link check) is implemented but not
  enforced by the default CI invocation — it only runs with `--strict-links`, which
  `.github/workflows/ci.yml` does not currently pass
- Neither `generate-catalog-projections.py --check` nor `changelog.py check` is wired
  into `.github/workflows/ci.yml` yet; both pass locally as of 2026-09-18 and belong in
  the same non-mutating CI step family. `flatten_skills.py` still prints a dead
  "now run generate_compact_skills.py" hint — the real generator is
  `scripts/generate-catalog-projections.py`
- No CI enforcement gate ("gate 1") is on by default — `validate-catalog-projections.py
  --gate1` (require every ledger exception applied) exists but isn't part of the
  standard CI invocation either

**Known issues:**
- History of frontmatter corruption: a prior CI configuration ran
  `fix_frontmatter.py`/`flatten_skills.py` in mutating mode, which collapsed 26 folded
  `description: >-` YAML blocks into the literal string `">-"` on every PR before this
  was caught and fixed (`67be4c9`) — see `context/decisions.md`. Any future CI wiring
  must keep every catalog script on its non-mutating flag (`--check`/`--dry-run`).
- `.agent-skills/jeo-skill/scripts/jeo-skill.py` (and everything else under
  `.agent-skills/`) is outside this project's `.mex/graph.db` index (only 12 root-level
  tooling files are indexed) — statements about it in the scaffold are source-verified,
  not graph-grounded.

## Routing Table

Load the relevant file based on the current task. Always load `context/architecture.md` first if not already in context this session.

| Task type | Load |
|-----------|------|
| Understanding how the system works | `context/architecture.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Editing skills.json, SKILL.md frontmatter, README/TOON projections, or diagnosing catalog CI | `context/catalog-pipeline.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it. Narrate what you load: "Loading architecture context..."
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After meaningful work, run this binary checklist:
   - **Ground:** What changed in reality? Name the changed behavior, system, command, dependency, or workflow.
   - **Record:** If project state changed, update the "Current Project State" section above. If documented facts changed, update the relevant `context/` file surgically.
   - **Orient:** If this task can recur and no pattern exists, create one in `patterns/` using `patterns/README.md`, then add it to `patterns/INDEX.md`. If a pattern exists but you learned a gotcha, update it.
   - **Write:** Bump `last_updated` in every scaffold file you changed. If the why matters, run `mex log --type decision "<what changed and why>"` or `mex log "<note>"`.

