# Ponytail — Changelog

All notable changes to the ponytail skill are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
Semantic versioning per [SemVer](https://semver.org/).

---

## [1.2.0] — 2026-06-22

### Added
- `metadata` block in `SKILL.md`: `category`, `tags`, `platforms`, `keyword`, `version`, `source`, `upstream` — aligns with skill-standardization schema

### Changed
- SKILL.md description rewritten with imperative verb lead; trigger list expanded (`ponytail review`, `ponytail audit`, `ponytail debt`, `lazy dev`)
- `SKILL.md` compatibility block updated to include `ai-slop-cleaner` route-out

---

## [1.1.0] — 2025-07-10

### Added
- `README.md` with full per-runtime install crosswalk (Claude Code, Codex, Gemini CLI, Pi, OpenCode, Cursor, Windsurf, Cline, Copilot, Kiro)
- MCP server setup guidance for Claude Desktop (`claude_desktop_config.json`)
- Demo GIF (`assets/ponytail-demo.gif`) — animated terminal walkthrough of the YAGNI ladder
- `CHANGELOG.md` (this file)
- Changelog snippet in README (latest 5 entries only)

### Changed
- `references/commands.md` — expanded instruction-only adapter table with exact file paths
- `scripts/install.sh` — doc comment clarifying `APPLY=1` env knob behavior

### Fixed
- Ponytail ladder rung order in `commands.md` was inconsistent with `SKILL.md`; unified to: skip → stdlib → platform → installed-dep → one line → minimum

---

## [1.0.1] — 2025-06-18

### Fixed
- `install.sh` `set -euo pipefail` caused early exit on macOS when `pi` or `opencode` were not on PATH; fallback `echo all` branch now always reached cleanly
- SKILL.md description trigger phrasing tightened per skill-standardization validator feedback (`description` must start with imperative verb)

### Changed
- `evals/evals.json` — added third eval (route-out to `caveman` when request is communication brevity, not code volume)

---

## [1.0.0] — 2025-05-30

### Added
- Initial `SKILL.md` with YAGNI ladder, never-cut safety list (`ponytail:` marker convention), four intensity levels (lite / full / ultra / off)
- `references/commands.md` — per-runtime command and install crosswalk
- `scripts/install.sh` — auto-detect runtime, print (or with `APPLY=1` run) the right install command
- `evals/evals.json` — two canonical evals: native date picker vs. flatpickr, delete-list review of LRUCache + hand-rolled email regex
- Upstream credit: `DietrichGebert/ponytail` (MIT); catalog: `akillness/oh-my-skills`

---

## [0.2.0] — 2025-04-14

### Added
- Compatibility note routing `caveman` (communication compression) and `code-refactoring` (behavior-preserving cleanup) as explicit out-of-scope skills
- `SKILL.toon` compact rendering for token-limited runtimes

### Changed
- Description rewritten to be trigger-oriented; now activates on: `ponytail`, `write less code`, `YAGNI`, `anti-bloat`, `minimal code`, `do I need this`, `lazy senior dev`
