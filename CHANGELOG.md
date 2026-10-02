# Changelog

All notable changes to **jeo-skills** are documented here.

## 2026-10-02

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
