# Changelog

All notable changes to **jeo-skills** are documented here.

## 2026-10-30

### Added
- Added the `impeccable` operator v1.0.0 for `pbakaus/impeccable` skill 4.8.0 / engine 0.1.18 at `02523aec3e4c4580102d996d1b6a71fbe062e03f` (Apache-2.0; LICENSE and NOTICE.md inspected, license copied as `LICENSE.upstream.txt`). It routes the 24 upstream commands, carries a paraphrased critique/audit method and craft floor for use without the upstream skill, documents the 62-rule detector, and gates npm execution, engine download/runs, the unsandboxed design hook, browser scans and live mode separately. Stdlib `scripts/doctor.py` inspects installs (upstream vs catalog operator under the same `impeccable` folder name), engine candidates in launcher order with optional pinned-digest checks, hook manifests, telemetry opt-outs and project context without executing anything; `scripts/triage_findings.py` ranks `detect --json` findings and routes them to commands without echoing snippets. `references/source.json` pins commands, checksums, rules and 19 selected file hashes. Catalog: 408→409 (`web/design`, `web-design` relationship group). New tests pass 22/22; installer 72/72 and setup-guide 34/34 pass on Node 24. Nine routing/safety evals are authored, not executed.
- Runtime-verified `impeccable` in a throwaway `HOME` on macOS arm64: the public catalog install was byte-identical to the repository folder; the pinned launcher downloaded engine 0.1.18 whose SHA-256 matched the pinned digest via `doctor.py --verify-digest`; the binary's `detect --list-rules --json` matched all 62 rules in `source.json`; a real `detect --json` run (exit 2, 19 findings) matched the documented finding schema and fed `triage_findings.py`. Triage now lists distinct sample locations (static HTML reports `line: 0`). URL/CDP scans, hooks, live mode, the npm route and Linux/Windows assets remain unverified.

### Changed
- `ponytail` v2.0.0: rebased on upstream Ponytail 5.3.3 (`7801d061243d7b753bad0e0b3c057cd250b11755`, MIT, license copied as `LICENSE.upstream.txt`): codebase reuse before stdlib, every broken caller finished, one small check for risky logic, replies ending with what was skipped and any risk, `ultra` pushing back on the request, `shortcut:` markers (older `ponytail:` still harvested), full-quality `/ponytail-review` and `/ponytail-audit`, and `/ponytail-gain` with the pinned benchmark (−53% code, −26% cost, −41% time) replacing the 80–94% claims. `references/commands.md` and `scripts/install.sh` cover every upstream plugin host, settings and uninstall; `APPLY=1` runs one host only. Moved from `cli-tools/ai-cli` to `engineering/code-quality`. Removed the 2 MB demo GIF, the nonexistent `skills serve` MCP setup, OpenCode file-path plugin lines that OpenCode 2 rejects, invented changelog dates and duplicate category/tag metadata; install payload 2.03 MB → 33 KB. Claude Code and omp installed plugin 5.3.3 through the new installer in isolated homes.
- `caveman` v2.0.0: follows the maintained `JuliusBrussee/caveman` 4.0.1 (`d262ab3882952a59312ff3537cd86d894523c5ab`, Apache-2.0, license copied, changes stated) instead of the copy credited to `mattpocock/skills`, which removed it; the unsourced “~75%” claim and generic filler sections are gone. `scripts/test_ponytail_caveman_skills.py` (12 tests, added to CI) checks pins, versions, links, legacy payload and the installer contract.

### Fixed
- `mex` v1.2: `scripts/install.sh` no longer stops after `mex setup` on mex-agent 0.8, which exits 2 while scaffold population is pending. It passes `--yes --tool <tool>` (and `--force`) to mex-agent >= 0.8, keeps the piped menu for 0.7.x, reports exit 2 with the `mex-agent setup next --start` next step and continues to the `AGENTS.md` bridge, graph and check, and stops on any other setup failure. A missing mex-agent is installed as `mex-agent@0.8.5` (`MEX_AGENT_NPM_SPEC` overrides). Verified with the real mex-agent 0.8.5 in a throwaway `HOME`.
- `obsidian-second-brain` v1.0.1: `WITH_UPSTREAM=1` no longer aborts on macOS `/bin/bash` 3.2 under a UTF-8 locale (`"$dest…"` parsed as an unbound variable). With `GLOBAL=1` the upstream checkout now replaces the routing-skill link that `npx skills add -g` creates at `~/.claude/skills/obsidian-second-brain` (only after a successful clone), an existing upstream checkout survives re-runs instead of being deleted by `npx`, other directories are refused, and a missing `git`, failed clone or refusal exits 1 instead of printing `Done`. The aliases report tolerates an upstream `SKILL.md` without an aliases line. Verified with the real `skills@1.7.0`, `git` and `/bin/bash` 3.2.
- `devup-ui` v1.0.1: braced the same `$pm…` expansion. `scripts/test-runtime-config-writers.sh` scans tracked shell scripts for unbraced variables directly before non-ASCII text and covers the obsidian upstream cases under a UTF-8 locale; `mex/scripts/test-runtime.sh` covers mex-agent 0.8 setup.

## 2026-10-24

### Added
- Added `awesome-gamedev-agent-skills` v1.0.0 as a pinned, collision-aware operator for `gamedev-skills/awesome-gamedev-agent-skills` at `7eb1b53305fab881f4758e2eff2e371cd7869221` (Apache-2.0; LICENSE/NOTICE inspected), with an unchanged hardened selected-file helper, source references and six authored routing/safety evals. Catalog: 406→407; `game-client`: three→four guides. Dedicated tests pass 6/6, installer tests 66/66 and selected-source hashes 12/12; an isolated real cached-installer guide-install probe passes. No wholesale upstream pack, host plugin, engine or provider was activated.
- Added verified Kimi Code (`kimi` → `kimi-code-cli`, shared skills) and Grok Build (`grok`, project `.grok/skills` or global `GROK_HOME/skills`) router destinations. Current setup uses Antigravity CLI `agy` instead of the retired Gemini CLI target and documents OpenCode consistently. Setup excludes Grok from automatic host selection because a `grok` binary can be Superagent/VibeKit without Agent Skill loading; controller `detect` reports binary inventory only.
- The ECC operator guide v2.2.2 adds read-only `plan --proposal` envelopes for Claude Code, Codex and Kimi, using the current host's assigned Jev profile for branch review while preserving explicit user approval and provider-owned trust. Six safety/routing scenarios are authored, not executed model evaluations. Published usage, quarantine and retirement coverage passes 22/18/8 tests without production runtime changes; five focused ECC regressions and the helper self-test now run in the Ubuntu/macOS CI matrix. Catalog remains 407 skills.

### Fixed
- Jev's shared rule and portable skill no longer steer every coding agent to `jeopi`. Successful per-host setup binds canonical host IDs to independent profiles in `agents.json` through the existing config-only controller, preserving custom assignments, native/scope fields and saved keys without registering hooks. Invalid, shared or unsafe mappings are rejected before setup effects; external runtime roots reject symlink ancestors. Config-only LM Studio binding preserves automatic model selection, and controller enablement now accepts a blank model for that autodetection path. README shell examples execute verbatim with valid guards. Existing real-HOME installs are not modified by this source update.
- Fixed ECC Claude proposals that omitted default `user`/`standard` choices even though the printed plan used them; proposal JSON now matches normalized commands. Malformed, duplicate and extra argument boundaries are rejected before proposal output. Jev `permit` is documented as decision evidence, never a substitute for user consent or host authorization. No ECC installation, hook activation or provider call was performed.

## 2026-10-22

### Fixed
- `setup-all-skills-prompt.md` and the `ooo` skill document a macOS failure found while applying the guide to a real home: uv wheels first downloaded inside an Aside session keep `com.apple.quarantine ...;Aside;`, macOS deletes their extension modules on load, and uvx keeps reusing the broken cached environment, so `uvx`-registered `semble`/`ooo` servers fail with `No module named 'orjson.orjson'`/`'rpds.rpds'`. Recovery, verified in fresh caches: stop uv-based MCP servers, run `uv cache clean` from a regular terminal, rerun; `--refresh`, `--reinstall`, and `uv cache clean <package>` do not fix it.

## 2026-10-21

### Added
- Added the `agent-beacon` operator, pinned to `Asymptote-Labs/agent-beacon` commit `cfbd7b1d721664e3b1b5ca2fca5eac4327532c07` (MIT), with a standalone selected-file helper, source/license references, six authored routing/privacy evals, setup guidance and canonical attribution. The catalog grows from 405 to 406; helper/installer regressions pass 20/20 and 65/65. Beacon capture, private data access, Cloud forwarding, hooks/MCP, services and removal remain separately approved operations.
- Added the pinned `harness2` operator plus `ruflo`, `voicestudio`, `diagram-design`, and `artcraft`; with `harness` retired, the catalog grows from 401 to 405 skills.
- Added local skill-usage tracking with candidate reporting, reversible quarantine/restore, permanent quarantine purge, a separate maintainer retirement script, and the Jev injection usage ledger.

### Changed
- Rebuilt all three READMEs for readability with new Codex visuals, tables and collapsible category lists; upstream sources and licenses moved to `docs/attribution.md`.
- Install and `prune-retired` cleanup now remove only fingerprint-matched catalog copies of retired `jeo`/`harness`; third-party copies, unrelated links, linked roots, and `.skill-lock.json` remain untouched.
- Refreshed README visuals and authored documentation, including the usage lifecycle, host boundaries, commands, and 18-operator preflight guidance.
- Refined the existing `open-ontologies` operator to v1.1.0 with explicit offline preflight and pinned-source references, setup/README guidance, and named-install/helper regressions; the catalog remains at 405 skills. Retired `jeo` removal reuses the existing fingerprint- and scope-guarded installer behavior.

### Removed
- Retired the revfactory `harness` skill and superseded README images (`readme-hero.webp`, `catalog-workflow.svg`, `runtime-architecture.svg`) plus the orphan `assets/scrapingant/` logo.

### Fixed
- `setup-all-skills-prompt.md`, from a full run in an isolated macOS HOME: Step 1 honors `$HOME` outside Aside (it installed into the login home even from CI or test homes), puts `~/.local/bin` on `PATH`, and no longer exits 1 when the last probed agent (Aside) is absent; `rtk init -g --auto-patch` registers the Claude hook that non-interactive runs skipped; the `ooo` MCP server runs from `uvx --isolated --from 'ouroboros-ai[mcp]'`, because `[all]` pins MCP SDK 1.x and `ouroboros mcp serve` could not start.
- The Aside step no longer rewrites JSONC `opencode.json` (it dropped comments and every other key) and registers through `opencode mcp add`; the knowledge-pipeline writer keeps customized wrappers, recognizes `$HOME`-spelled hooks, writes settings only on change, and keeps non-ASCII text.
- Step 4D only verifies and reports stale `~/.config/opencode/skills` copies instead of reinstalling; Step 7 uses the scoped `skills list -g -a universal` (the unscoped form hung on large homes) and the router by absolute path; three broken code fences were restored; Steps 6–7 now precede the on-demand reference.
- `jeo-skill` run from HOME no longer resolves the legacy `~/.agent-skills/skills.json` (an old 140-skill catalog) instead of the current one; `ooo`'s MCP example uses the `[mcp]` extra with `--isolated`. New `scripts/test_setup_guide_regressions.py` runs in CI.

## 2026-10-15

### Added
- Added the source-pinned `okf-agent-memory` operator for the `okf-memory/okf-agent-memory` Go CLI and stdio MCP (commit `ad7beb01b9d4294d8dd28c25494d274374985b69`, MIT), covering project-local OKF v0.2 workflows, source-pinned commands, security, and approval gates.
- Added a standalone stdlib preflight bound to the pinned commit; the repository-preflight suite passed 13/13, including malicious-path, pin, symlink, size, no-write, and credential-isolation cases.

### Changed
- Registered `okf-agent-memory` under `ai-agents/memory`, linked it with `okf` and related knowledge-vault skills, clarified the Google OKF v0.1 authoring path, and refreshed projections and README/setup guidance; the catalog grew from 367 to 368 skills.
- Recorded the pinned `go.mod` requirement of Go 1.26.0 against the guide's 1.22+ prerequisite; no upstream installation, build, bootstrap, MCP registration, or target-project write was performed.

## 2026-10-14

### Added
- Codex lifecycle hook installation that preserves existing definitions, injects selected
  full skill instructions, and supports optional advisory or enforced tool review.
  Exact hook trust and host permissions remain separate from profile activation.
- Opt-in `assist` profiles for Claude and Pi-family hosts. Pi-family callbacks can
  prune older Jev-owned context while preserving current instructions and host history.
- Runtime regression coverage for real hook envelopes, UTF-8 streams, profile isolation,
  malformed configuration, bounded input, and trusted skill-file containment.
- Isolated Python and Node regressions for resource ownership, allocation bounds,
  cache freshness and error precedence, wired into the installer CI matrix.

### Fixed
- Native Jev timeout tests synchronize child signal-handler readiness and advance
  deadline/grace timers deterministically, preserving SIGTERM/SIGKILL and actual
  process-exit checks without changing production timeouts.
- `jev-harness.mjs` now treats the first positional argument as the command, so leading
  flags work: the documented `--profile <id> --mock self-test` (setup guide) no longer
  fails with a usage error. `self-test --mock` keeps working.
- Hosted `api` route-skills no longer fails with "choice probabilities must sum to 1":
  jev-1.13.0 rounds probabilities to 2 decimals (e.g. sum 0.99), so the harness now accepts
  drift up to 0.02 and renormalizes; larger deviations still fail closed.
- Failed or interrupted video exports terminate and reap their owned encoder
  process without replacing the original error. Media capture paths clean temporary
  PNGs and browser state on failure and report cleanup-only failures.
- Local Jev HTTP requests reject negative or greater-than-1-MiB lengths before
  reading, bound idle socket I/O to 10 seconds, and close the server on exit.
- GLB readers bound forged chunk lengths to physical file bytes; GLB merge output
  no longer concatenates the complete binary payload with its chunk header/padding.

### Changed
- Refreshed English, Korean and Spanish README commands, documentation links,
  TOON boundaries and native Jev integration descriptions. Monthly release sources
  now preserve the current entry; duplicate generated footer markers were removed.
- Replaced eight obsolete README illustrations with a Codex-generated static WebP
  cover and two source-accurate SVGs, with generation provenance and readable
  850-pixel browser verification. Unrelated partner branding remains intact.
- Catalog parsing prefers the safe native YAML loader with a safe Python fallback;
  frontmatter and link scans avoid duplicate reads without changing projections.
- Query scoring caches reusable metadata while detecting changed inputs. Installer
  hashing, environment audit reads and daemon-log discovery avoid whole-file copies.

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
