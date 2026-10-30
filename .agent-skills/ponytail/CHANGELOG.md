# Ponytail — Changelog

Changes to the jeo-skills `ponytail` skill. Dates come from this repository's
git history.

## [2.0.0] — 2026-10-30

### Changed
- Rebased on upstream Ponytail 5.3.3 (`7801d061243d7b753bad0e0b3c057cd250b11755`, MIT): reuse code already in the codebase before stdlib or platform features, finish every caller the change breaks, leave one small check for risky logic, end every reply with what was skipped and any risk, `lite` names the smaller option and `ultra` pushes back on the request, and the never-cut list adds hardware calibration and anything the user asked for.
- Shortcut marker is now `shortcut: <limit>, <when to upgrade>`; `/ponytail-debt` still collects older `ponytail:` markers.
- `/ponytail-review` and `/ponytail-audit` are full quality reviews (correct, safe, load, tested, fast, lean) with numbered findings; added `/ponytail-gain` with the pinned benchmark (−53% code, −26% cost, −41% time) in place of the older 80–94% claims.
- `references/commands.md` and `scripts/install.sh` cover every upstream plugin host (Codex `plugin add`, Copilot CLI, Qwen, omp, OpenCode 2 `plugin add`, Antigravity, Hermes, Devin, Grok, Goose, OpenClaw, Kimi, Cursor hooks), settings and uninstall; `APPLY=1` runs one host only.
- Moved from `cli-tools/ai-cli` to `engineering/code-quality`.

### Removed
- The 2 MB demo GIF (old ladder and install lines), replaced by a 5 KB SVG of the current ladder.
- The README "Claude Desktop (MCP server)" setup: `skills serve` is not a skills CLI command.
- OpenCode file-path plugin instructions, which OpenCode 2 rejects.
- Duplicate category and tag metadata in `SKILL.md`; the catalog manifest owns them.

## [1.2.1] — 2026-06-30
- Shortened the description, clarified the review, audit and debt output contracts, and routed correctness reviews to `code-review`.

## [1.2.0] — 2026-06-22
- Added the `metadata` block and expanded triggers.

## [1.1.0] — 2026-06-22
- Added `README.md`, this changelog and a demo GIF.

## [1.0.0] — 2026-06-15
- Initial skill: the ladder, the never-cut list, `references/commands.md`, `scripts/install.sh` (with OpenCode autodetection) and evals.
