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
last_updated: 2026-10-01
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Working:**
- The catalog manifest (`.agent-skills/skills.json`, 350 skills) and its three
  projections (`.agent-skills/skills.toon`, `README.md`/`README.ko.md`/`README.es-ES.md`
  category tables, each skill's own SKILL.md frontmatter) are validated end-to-end by
  `scripts/validate-catalog-projections.py`, wired into `.github/workflows/ci.yml`
  on every PR into `main`
- The frontmatter-freeze exception ledger ("Rule F") — `scripts/build_exception_ledger.py`
  builds it, `validate_frontmatter_frozen()` + a dedicated `--self-test-rule-f` CI step
  enforce it fail-closed
- The `jeo-skill` router (`.agent-skills/jeo-skill/`) — browse (`categories`, `list`,
  `search`, `related`) and selectively install with `jeo-skill install`, filterable by
  bundle, category, or subcategory, and previewable with `--dry-run`, without a full
  repo checkout; delegates real installs to `npx skills add`
- The flat `.agent-skills/<name>/SKILL.md` layout is enforced by
  `flatten_skills.py --dry-run` in CI (no category subfolders)
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
- Context-layer lifecycle policy (2026-10-01): decided via a Path B Socratic
  interview (Ouroboros MCP timed out; CLI upgraded 0.50.5 → 0.55.3) plus six
  parallel research reports. Seed `.ouroboros/seeds/seed_ctx_lifecycle_20261001.yaml`
  validates against the installed `Seed` model (12 ACs, 12 constraints); reports in
  `.ouroboros/research/{mex,zvec-grep,graphify,llm-wiki,patterns,audit}.md`.
  Policy: hybrid triggers (TaskCompleted inline + SessionEnd detached `ctx refresh`;
  per-repo `pre-push` `ctx checkpoint` chained before git-lfs), regenerable caches
  deleted+rebuilt, authored pages archive→30d TTL, `raw/` exempt, per-layer locks
  shared with ingest producers, single vault SSoT `~/vaults/llm-wiki`,
  `graphify-out/` canonical with deletion-aware reconciliation, mex-agent 0.8.3.
  Nothing has been implemented or deleted yet — next step is executing the seed.
- Published router hardening as `fef4b525` to origin/main. GitHub Actions run
  `36867473636` passed catalog and Ubuntu/macOS installer jobs. A fresh isolated
  remote bootstrap fetched the published router byte-for-byte, passed doctor, and
  installed responsive-design through real skills@1.7.0 into shared/GJC roots.
  Existing Actions Node20 deprecation warnings remain; npm registry publishing is
  not configured for this repository.

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

