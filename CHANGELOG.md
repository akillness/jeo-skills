# Changelog

All notable changes to **jeo-skills** are documented here.

## 2026-10-02

### Added
- Optional Jevgrep source discovery via `jeo-skill explore`: explicit directory and
  per-call remote consent, inert dry-run, bounded execution and unchanged local search defaults.
- Jevgrep catalog skill and skills/wiki/graph-source routing guidance without graph
  traversal, graph rebuild, automatic installation or authentication.

### Fixed
- Jev stays optional: skipped and non-interactive default installs do not fetch or
  configure it, and project-scoped catalog installs cannot alter global Jev state.
- Jev status separates configured opt-in from backend readiness; configured outages
  and malformed decisions fail closed, while uncertain context blocks are preserved.
- Canonical setup preserves selected backend configuration and validates prerequisites
  before writing it. Local model serving uses installed weights without implicit downloads.

### Changed
- English, Korean, and Spanish READMEs, the setup guide, and architecture/workflow
  SVGs distinguish catalog distribution, optional Jev setup, and host-adopted rules.
- Isolated Jev setup and backend-contract regressions now run on Ubuntu and macOS CI.
- Current README locales, setup guide and SVGs distinguish optional Jevgrep discovery
  from Jev decision execution; catalog projections include all 353 skills.
- Twelve Jevgrep wrapper regressions run in Ubuntu/macOS CI. Published-package
  loopback checks verify source-content transport, not live-provider retrieval quality.
