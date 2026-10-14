# Changelog

All notable changes to **jeo-skills** are documented here.

## 2026-10-14

### Fixed
- `jev-harness.mjs` now treats the first positional argument as the command, so leading
  flags work: the documented `--profile <id> --mock self-test` (setup guide) no longer
  fails with a usage error. `self-test --mock` keeps working.
- Hosted `api` route-skills no longer fails with "choice probabilities must sum to 1":
  jev-1.13.0 rounds probabilities to 2 decimals (e.g. sum 0.99), so the harness now accepts
  drift up to 0.02 and renormalizes; larger deviations still fail closed.

## 2026-10-08

### Added
- Per-operation Jev backend routing: profiles declare `JEV_ROUTE_SKILLS_BACKEND` /
  `JEV_PRUNE_CONTEXT_BACKEND` / `JEV_REVIEW_BACKEND` plus ordered `_FALLBACK` allow-lists;
  `--backend` / `--model` per-invocation overrides; `status` reports per-operation chains
  (`--operation`) and exits 3 only when a chain has no usable backend.
- Fifth backend kind `systemone` with translation drivers for TypeSafe-compatible
  `/v1/systemone`, AutoTrust `/v1/decide` (`thinking: off`), and vLLM `jev-decision` logprobs;
  `jev-setup.sh --mode systemone` and per-operation policy flags.
- Cap-aware skill selection replacing the single-category gate: sharded wide Choice + gate
  Nouls then finalist verification, or lexical shortlist + Noul rerank, with an explicit none
  outcome (`selection.reason`) that triggers the public-registry fallback.
- Advisory host routing: optional `skills.json` `model_policies` (`provider/model`
  vocabulary) feeds a `routing` field on `route-skills`; the manifest validator learns the
  table and projections are unchanged.
- Tier attestation: `JEV_<KIND>_VALIDATED_MODEL` must match the served model and is honored
  only for calibrated decision-head drivers (`api`, `systemone`); `permit` is possible only on
  tier `validated`. Receipt v2 binds `backend.kind/model/tier`. New `smoke` subcommand never
  authorizes.

### Fixed
- Hosted `api` transport now matches the documented `/v1/systemone` contract (required
  `model`, Choice `criteria` map, `noul` answer field); the regression fixture speaks the
  documented shape and rejects bodies without `model`.
- `prune-context` batches blocks per request keyed by position (duplicate ids safe), bounded
  by each backend's state limit so no block is judged unseen; oversized review input is
  rejected before I/O instead of being truncated server-side.
- A saved configuration that configures no valid backend is invalid (exit 3), and an ambient
  `JEV_MODE` switch cannot turn a saved opt-in into "inactive"; timeouts report the deadline
  that actually elapsed.
- `route-skills` works from an installed harness outside a jeo-skills checkout: setup installs a
  validated catalog snapshot (`~/.agents/jev/skills.json`, never replaced by an invalid
  download), and the harness resolves `JEV_CATALOG_PATH`, the working checkout, the snapshot,
  then a legacy side clone, so a stale clone no longer shadows current catalogs. Skill excerpts
  sent to backends are confined to the catalog root on canonical paths (`../` and symlinks out
  are refused).

### Changed
- `local` (base-model logits), `ollama`, and `lmstudio` (JSON-from-chat) are documented as
  System 2 paths that remain `unvalidated` permanently; the JEV-9B card's calibration claims
  apply only to the `jev-decision` head these adapters do not use.
- Rule, README, and the `jev-control-plane` skill describe five kinds, tiers, per-operation
  keys, selection/routing output, receipt v2, and `smoke`.
- `README.md`, `README.ko.md`, `README.es-ES.md`, and `setup-all-skills-prompt.md` document
  per-operation routing, the `systemone` mode, attestation tiers, `model_policies`, and the
  catalog snapshot; the setup guide's consent-gated block now accepts `systemone`. Exit-code
  docs now state that invalid configuration also exits `3` (fail closed), as the harness does.

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
