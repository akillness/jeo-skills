---
name: architecture
description: How the major pieces of this project connect and flow. Load when working on system design, integrations, or understanding how components interact.
triggers:
  - "architecture"
  - "system design"
  - "how does X connect to Y"
  - "integration"
  - "flow"
edges:
  - target: context/stack.md
    condition: when specific technology details are needed
  - target: context/decisions.md
    condition: when understanding why the architecture is structured this way
  - target: context/catalog-pipeline.md
    condition: when the task touches skills.json, SKILL.md frontmatter, README/TOON projections, or CI validation
  - target: patterns/catalog-metadata-changes.md
    condition: when adding a new skill or editing an existing skill's metadata
grounds_to: []
last_updated: 2026-10-08
---

# Architecture

## System Overview
jeo-skills primarily distributes a catalog, not a running agent application.
Optional Jev decision execution and Jevgrep source discovery are separate flows:

**Authoring flow (source of truth):** a skill lives at `.agent-skills/<name>/SKILL.md`
(instructions an agent reads). Its category, subcategory, interface, tags, bundle
membership, relationship groups, and retirement info live once, centrally, in
`.agent-skills/skills.json` — never duplicated inside the skill folder itself. From that
one manifest, `.agent-skills/skills.toon` (compact pipe-delimited projection) and the
`README.md` / `README.ko.md` category tables are derived and must stay in lockstep.
`scripts/validate-catalog-projections.py` is the read-only gate that proves manifest ↔
TOON ↔ README ↔ SKILL.md frontmatter never drift apart; it runs on every PR via
`.github/workflows/ci.yml` and never edits a file itself. See
`context/catalog-pipeline.md` for the validation stages in detail.

**Install/consumption flow (end users of the catalog):** `install.sh` bootstraps the
lightweight router into the requested scope's `.agents/skills` through pinned
`skills@1.7.0`, then invokes that exact installed router (never a stale global copy).
Global installs link `~/.local/bin/jeo-skill`; project installs leave that link alone.
The router resolves catalog selections and delegates transport to `npx skills add`
with `--copy --full-depth`. jeopi/JEO/OMP use shared roots; GJC requires its native
`.gjc` root, Aside requires an existing account's `skills/user`, and Antigravity CLI
and IDE need separate native global roots. `install_support.py` centralizes safe
copying for these projections and the existing `scripts/sync-aside-skills.py` entrypoint.
Post-install checks verify selected skill files. No provider settings or hooks change.
These scripts remain outside the current mex index; claims are source/smoke-grounded.

**Optional Jev flow:** `jev/jev-setup.sh` is the canonical home-scoped installer.
Skipped and non-interactive unset modes bypass Jev; project-scoped catalog installs
never configure global Jev. Explicit project opt-in fails before installation writes.
Opt-in installs configuration and a rule artifact, not native hooks or plugins.
The host must load and follow that rule to invoke route/prune/review at task events.
Since 2026-10-08 the harness is a backend registry of five kinds (`api`, `local`,
`ollama`, `lmstudio`, `systemone` with `typesafe`/`decide`/`vllm-jev-decision` drivers)
resolved per operation from the profile base file (`JEV_<OP>_BACKEND` + ordered
`_FALLBACK` allow-list, `--backend/--model` overrides), never across profiles. A
request is bounded by the answering backend's state limit before I/O and rejected
rather than trimmed. Tiers: every kind is `unvalidated`; `validated` requires a
served-model attestation and a calibrated-head driver (`api`/`systemone` only), and
`review` can `permit` only on `validated`. Skill selection is cap-aware (sharded
Choice + gate Nouls, or lexical shortlist + Noul rerank) with an explicit none outcome;
`skills.json` `model_policies` (manifest-only, never projected) drives an advisory
`routing` field no host consumes yet. Setup also installs a validated catalog snapshot
(`~/.agents/jev/skills.json`) so `route-skills` works outside a checkout; a working
checkout's catalog still wins. `status` reports per-operation chains and exits
3 only when a chain has no usable backend; API credentials alone leave readiness
unverified. Runbook: `patterns/jev-control-plane.md`; commands in `jev/README.md`.

**Optional Jevgrep discovery:** `jeo-skill explore QUERY --root DIR` delegates source
text discovery to manually installed `@dzhng/jevgrep@0.8.0` only with explicit
`--allow-remote`. It dispatches before catalog loading; dry-run invokes neither the
binary nor a provider. Default catalog metadata search and native exact/LSP/zvec
retrieval remain unchanged. Graph-source text is eligible, but graph query/path/explain
and checkpoint ownership remain authoritative: no graph binary traversal or rebuild.
The wrapper enforces no-cache, concurrency/request/output bounds and a subprocess
timeout; these bounds are not monetary or upload-size limits. See
`.agent-skills/jevgrep/SKILL.md` for authorization and the pinned CLI contract.

## Key Components
- **`.agent-skills/skills.json`** — the manifest / single source of truth for all
  catalog taxonomy; every other projection is generated from or validated against it.
  Structurally enforced by [`validate_manifest()`](mex://function:39bf96d64d80b27fa57ef4bb8138a7d9).
- **`scripts/validate-catalog-projections.py`** — the CI gate; six independent checks
  (manifest structure, TOON, SKILL.md loadability, README×2, frontmatter-freeze ledger,
  optional link census) called from `main()` in that order, each raising
  `ValidationError` (never mutating a file) on mismatch.
- **`.agent-skills/jeo-skill/`** — the lightweight browse/search/install CLI
  (`scripts/jeo-skill.py`) distributed as its own installable skill so a consumer never
  needs a full repo checkout; delegates transport to npx and verifies native projections.
- **`scripts/repair-skill-frontmatter.py`** — the mutating counterpart to the
  validator; recovers broken YAML frontmatter via
  [`load_sources()`](mex://function:561f5afc30392dacaf2e9f59fc399f7d) and
  [`repair_document()`](mex://function:6ec8fb763db3e36e7ba5ad788883f5a7); replaces the
  deprecated `fix_frontmatter.py` shim.
- **`flatten_skills.py`** — guards the flat `.agent-skills/<name>/SKILL.md` layout (no
  category subfolders); CI runs it only with `--dry-run`.
- **`hooks/ingest-prompt.py`** — a separate, unrelated concern: the llm-wiki/graphify
  prompt-capture hook distributed by this repo's `setup-all-skills-prompt.md`, not part
  of the skill-catalog pipeline itself.

## External Dependencies
- **GitHub (`akillness/jeo-skills`)** — the repo itself is the distribution source;
  `npx skills add <repo>` and `jeo-skill.py`'s catalog fallback both fetch directly from
  it (raw.githubusercontent.com for the manifest, GitHub for `skills add`).
- **`npx skills` (Agent Skills CLI)** — the actual installer; both `install.sh` and
  `jeo-skill.py` shell out to it; only required native projections use the shared copy helper.
- **PyYAML** — required by `repair-skill-frontmatter.py` /
  `validate-catalog-projections.py` for structurally correct frontmatter parsing (see
  `context/decisions.md` for why regex parsing was rejected).
- **GitHub Actions (ubuntu-latest, `setup-bun`, `setup-python@v5` pinned to 3.11)** —
  runs the four `.github/workflows/ci.yml` validation steps on every PR into `main`.

## What Does NOT Exist Here
- No application build or project-wide pytest/jest framework. Installer regression
  coverage uses `python3 scripts/test_installer_regressions.py`; the optional Bun
  runtime-loader probe requires explicit external module and isolated fixture paths.
  Catalog governance remains standalone read-only Python commands.
- No agent runtime execution of skills — the actual hosts (Claude, Codex, Gemini,
  OpenCode, jeopi) that interpret `SKILL.md` live outside this repo. Optional Jev
  provides a callable decision harness/local server, not automatic host enforcement.
- No category subfolders under `.agent-skills/` — taxonomy is manifest-only metadata,
  enforced by `flatten_skills.py --dry-run` in CI.
- No secondary skill-code sandbox: catalog skills remain instructions, not applications.
