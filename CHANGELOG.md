# Changelog

All notable changes to **oh-my-skills** are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/); the README
"What's New" sections remain the long-form source.

## [Unreleased]

### Added
- **jeo-code (jeo) as a first-class agent** in `setup-all-skills-prompt.md` — Step 0 now detects `command -v jeo`, and a new **Step 3i** wires the semble · rtk · graphify · llm-wiki · obsidian flow into jeo's real loading surfaces: a global rule at `~/.agents/rules/jeo-tool-flow.md` plus two hooks in `~/.jeo/config.json` (`post-implementation` → `graphify update .`, `post-turn` → llm-wiki ingest). Steps 3f-2/4/6 updated with jeo notes and verification. (`34cda69`)

### Changed
- **autoresearch ratchet pass over the 10 most-recent skills** — trimmed `cli-anything` description under the 1,024-char spec limit; added frozen `evals/evals.json` to `cli-anything`, `opik`, `spec-kit`, `agenticskills`; added `SKILL.toon` to five skills and the missing `metadata.keyword` to `agenticskills`; added `FORCE=1`-overridable fast paths to `opik`/`spec-stack` installers. (`dd1b94e`)
- **rtk × semble compatibility wiring** — Step 3f now also installs the semble CLI and registers its MCP with Gemini; new Step 3f-2 injects a division-of-labor routing rule (semble = what to read, rtk = how dense) into each agent's instruction file. (`3cd9497`)

### Removed
- Generated `.agent-skills-wiki/`, `docs/`, `graphify-out/`, and `llm-wiki/` artifacts (257 files) from the repo; `.agent-skills/` remains the single source of truth. (`9548203`)

## [2026-06-11] — cli-anything + spec-stack (→ 137 skills)

### Added
- **`cli-anything`** — routing-first wrapper around HKUDS [CLI-Anything](https://github.com/HKUDS/CLI-Anything): install ready-made harnesses via the CLI-Hub package manager, give agents the autonomous discovery meta-skill, generate a new harness from any codebase/repo via the 7-phase pipeline, or iterate with `:refine`/`:test`/`:validate`. 40+ harnesses, 2,461 passing tests, Click CLIs with REPL + `--json`. Plugin-installable. (`3c2ea02`)
- **`spec-stack`** — composition skill for `spec-kit` × `ooo` × `cli-anything` (Write → Freeze → Run, verified): spec-kit authors the spec, ooo freezes an immutable seed and loops until verified, cli-anything supplies agent-native harnesses whose `--json` output is the evaluate evidence. Three patterns (full-stack / loop-only / docs-only) with a one-way spec → seed flow. (`e5631e2`)

### Fixed
- `cli-anything` project-install locking and `.gitignore` for per-agent skill copies; `skills.json`/`skills.toon` catalog backfill and manifest-path normalization. (`847edd8`, `413be1e`)

## [2026-06-10] — opik (→ 134 skills)

### Added
- **`opik`** — routing-first wrapper around Comet's [Opik](https://github.com/comet-ml/opik): pick a server mode (cloud / `./opik.sh` Docker Compose / Kubernetes-Helm), install + `opik configure` the Python SDK, trace via `@opik.track` or 50+ framework integrations, score with LLM-as-a-judge metrics, gate CI with Datasets/Experiments + PyTest, monitor production, and apply Agent Optimizer / Guardrails. Plugin-installable. (`19496f2`)

### Fixed
- `opik/scripts/install.sh` made safe outside virtualenvs — venv-aware uv/pip selection with a PEP 668-safe `uv tool install` path. (`e03e10b`)

## [2026-06-08] — spec-kit (→ 133 skills)

### Added
- **`spec-kit`** — GitHub Spec-Driven Development wrapper around `specify-cli`: install, bootstrap a project for 30+ supported agents, and drive `/speckit.constitution → specify → clarify → plan → analyze → tasks → checklist → implement`. Plugin-installable. (`d465e08`)
