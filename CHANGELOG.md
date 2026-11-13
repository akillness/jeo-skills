# Changelog

All notable changes to **jeo-skills** are documented here.

## Unreleased

### Added
- `browser-use` v1.0.0 (`web` / `testing`) adds a source-pinned operator for `browser-use/browser-use` 1.0.3 at `dfb6a73d520809341c975c6a01c228327991e88b` (MIT): one path per request (CLI, Python library, Browser Use Cloud or `--cli-mcp`), tiered approval gates, four audited references, a 26-file SHA-256 source manifest, ten behavioral evals and an offline stdlib `scripts/preflight.py` (`--json`, `--repo`, `--expect-commit`, `--project`; exit 0/1/2, `runtime_verified: false`) that reports install routes, local browsers, credential variable names only, the telemetry default, stored-key/`agent_helpers.py`/cloud-marker presence, where `skill install` would collide, and a project's exact pin. Hazards found by executing the read-only CLI and the 0.x removal errors on a throwaway 1.0.3 install are recorded in `references/upstream.md`: `browser-use skill install` overwrites the same-named `SKILL.md` in `~/.agents/skills` and every installed agent directory, through symlinks too; telemetry is on by default and covers `--help`/`--version`; `Agent(task)` alone uses the gateway model and a billed cloud browser; `agent_helpers.py` runs on every CLI call; upstream `qa` self-signs-up and opens public tunnels and `x402` funds wallets. New manifest groups `browser-use-stack` (layered, with `browser-harness` and `jev-ultrafast`) and a `browser-evidence` membership; attribution row, on-demand `setup-all-skills-prompt.md` section, README notes in all three languages, `scripts/test_browser_use_skill.py` (wired into CI) and registration in the shared preflight contract suite.
- `jev-plugin.mjs hooks-install --agent cursor` installs a Cursor hook runner for the Jev control plane: two command entries in `~/.cursor/hooks.json` that run the new `jev/plugins/cursor/hooks/jev-cursor-adapter.mjs`. `beforeSubmitPrompt` returns the suggested skill names as `additional_context` (`JEV_RUNTIME_MODE=assist` behaves as advisory on Cursor, which drops context past 10,000 characters, so no skill body is read or injected); `preToolUse` reviews `Shell`, `WriteShellStdin`, `Write` and `Delete` once the profile sets `JEV_REVIEW_MODE=advisory` or `enforce`. The runner prints one JSON line and exits 0 on every path, never answers `allow` or `ask`, never denies a prompt, redacts common secret shapes and the home directory and bounds the text before any backend call, and under `enforce` withholds a matched tool call it cannot review. Installation previews by default, is idempotent, merges without touching other entries, and refuses a `hooks.json` without `version`, with comments, or with an invalid matcher. The hook commands name the stable Homebrew `bin/node` link instead of the versioned `Cellar` path, and the result warns when only an nvm, fnm or Volta path is available. `jev/cursor.test.mjs` runs the real runner and controller against payloads built from Cursor's documented hook schema and is part of CI. Live Cursor execution was not observed; `additional_context` on these two events is not on Cursor's public hooks page and was confirmed only by reading the cursor-agent 2026.11.11 bundle.
- `revfactory-harness` v1.0.0 adds a source-specific operator for `revfactory/harness` v2.1.0 at `92d9f1b29e7af81acebf51a9fcd1832e739a1414` (Apache-2.0), separate from `harness2` and the retired `harness` catalog name. It includes progressive installation/workflow references, an 18-file SHA-256 manifest, an offline stdlib preflight for host/source/destination checks, compact discovery, and ten behavioral eval cases. Catalog installation never registers the upstream plugin or generates agents; native tool/model availability, project writes, and paid execution remain explicit gates. README translations, catalog projections, setup guidance, attribution, and CI regression coverage in `scripts/test_revfactory_harness.py` are updated.
- `obsidian-second-brain` v1.1.0 adds consented, new-vault-only `setup.py`, a shared tool-free JSON-proposal `runtime.py`, and portable `ctx_guard.py` lifecycle roles using upstream operating assets pinned to `c8b1d8c1c5b41d4f1845f7188200d354837be96f`. Setup requires reviewed targets, data/model/hook/PostCompact/schedule permissions and Claude allowances, makes no model calls, installs a new-vault-local Claude PostCompact hook and managed cron block, and leaves separately approved index initialization pending. No migration or existing-install change is performed.
- `image-to-github-repo` v1.0.0 (`research` / `web-research`) resolves the GitHub repositories named in a screenshot, card-news slide or post. Its stdlib-only `scripts/resolve_repo.py` sends GET requests to the GitHub API only: it verifies printed links and follows renames, ranks same-named repositories using printed star counts (0.9×–2× window) and English keyword hints, and reports `verified`/`high`/`medium`/`ambiguous`/`low` rather than choosing between lookalikes. Keywords never rule a repository out; only a printed star count can. `GITHUB_TOKEN`/`GH_TOKEN` is optional and sent to `api.github.com` only; batches are capped at 25. Setup boundary documented in `setup-all-skills-prompt.md` (on-demand runtimes); offline tests in `scripts/test_image_to_github_repo.py`, run by CI.
- `moneyprinter-v2`, `agent-s`, `google-maps-scraper` and `gitingest` v1.0.0 join the existing `fabric` guide as the `github-five-programs` bundle. Each is a router-first operator pinned to an audited upstream commit (`a734fa92…`, `0fff0e63…`, `903b96d7…`, `4e259a02…`) with `references/source.json` SHA-256 hashes, an offline stdlib `scripts/preflight.py` (exit 0/1/2, `runtime_verified: false`, advisory `info` checks) and evals. Audited hazards are documented in each `references/upstream.md`. New manifest relationship groups `moneyprinter-projects`, `maps-outreach-chain` and `computer-use-agents`; attribution rows added to `docs/attribution.md`; on-demand section added to `setup-all-skills-prompt.md`; offline tests in `scripts/test_five_github_programs.py`, run by CI.
- `jeo-skill readiness [names] [--global] [--json]` (new `skill_readiness.py`) runs the offline `scripts/preflight.py` of `fabric`, `moneyprinter-v2`, `agent-s`, `google-maps-scraper` and `gitingest` and prints one report (exit 0 all ready, 1 blocked or not installed, 2 a helper could not report). `install --setup`, `install.sh` for `JEO_SKILLS_SELECTION=all` or the `github-five-programs` bundle (opt out with `JEO_SKILLS_READINESS=skip`) and `scripts/install-full-tools.sh --programs` print it after installing; exits 0 and 1 never fail an install, and the full-tools total and exit status are unchanged. `fabric` v2.2.0 gains a pinned helper (`8e8511c7…`) and audit notes; `image-to-github-repo` joins the `starter` bundle. Tests: `scripts/test_five_github_programs.py`.
- `openspace` prompt routing now reaches jeo-code: `route-hooks.py install --host jeo` registers the router as a `pre-prompt` hook in the hooks-only registry `~/.jeo/hooks.json` (`config.json` is never touched), and `route_prompt.py --host jeo` answers with the Claude-style `additionalContext` object. It needs jeo-code 0.12.23 or newer, which also adds the `turn-end` event so `ingest-prompt.py` / `ingest-output.py` can capture prompts and replies; an older jeo ignores the file. Jev's own jeo integration is unchanged (`pre-tool` only).
- `jeo-skill usage scan` now reads jeo-code sessions from project-local `<project>/.jeo/sessions` stores. Before, only `~/.jeo/sessions` was read, which jeo never writes, so the `jeo` source always reported 0 records and a skill used only through jeo could become a `prune-unused` candidate. New repeatable `usage scan --project-root PATH` (remembered in `usage-cursor.json` as `jeo_project_roots`, pruned when the directory vanishes, capped at 512) and `JEO_SKILL_JEO_SESSION_DIRS`; repositories from `usage relevance --repos` and the current directory are read as well. The jeo parser now counts assistant `read` tool calls of `<dir>/<name>/SKILL.md` or `skill://<name>` instead of path-only result lines (which real jeo reads never produce, while `find`/`bash` listings did). A one-time re-read under the new parser (`jeo_parser_version` 2) does not inflate counts, and no transcript text is stored. Tests in `scripts/test_skill_usage_regressions.py`.
- `jev/jev-control-plane.rule.md` now opens with a `description` frontmatter so jeopi lists the rule instead of skipping it (a rule file with neither `alwaysApply` nor a description is ignored); it stays on demand because the rule is about 14 KB. `scripts/test_setup_workspace.py` pins the frontmatter on every shipped `jev/*.rule.md`.

### Changed
- Prefer `JEO_SECOND_BRAIN_CONFIG=/absolute/reviewed.json bash scripts/install.sh` (optional `JEO_SECOND_BRAIN_SOURCE` pinned checkout) or direct `python3 scripts/setup.py --config ... --dry-run` followed by apply. `WITH_UPSTREAM=1` now requires that configuration rather than cloning/pulling a global upstream skill or executing unsafe upstream `setup.sh`. Automated source handling supports UTF-8 text; unsupported binaries are retained with explicit errors while supported entries can progress independently.
- Portable lifecycle retains mex/zvec/Graphify/vault roles without a private HOME `ctx` package, preserves all raw trees including video and archived-root sources, and implements no legacy GC or unapproved deletion. Graphify rebuilds only at checkpoint with separate provider/model/unbounded-cost authority; Claude allowances are estimates, not a hard billing guarantee or a Graphify cost cap. Installed smoke/fixture evidence does not verify real-provider model quality, billing or live host integrations; other hosts use operating documents/shared runtime, not fabricated native PostCompact hooks.

### Fixed
- Jev Claude/Codex hook reinstallation now migrates PreToolUse matchers, splitting mixed managed/user hook groups so unrelated hooks retain their original matcher and metadata. Preview remains read-only and repeated apply is idempotent.
- Jev native proposal review prefers the current host-supplied task over stale session/turn caches and withholds oversized current tasks rather than reviewing a cached task. Regression tests cover all four extension hosts, matcher upgrades, mixed groups, and Codex fixture HOME isolation.
- `scripts/setup-workspace.py` now writes `jeo-workflows.md` as an always-applied harness rule: YAML frontmatter with `alwaysApply: true` first, then the `JEO-WORKFLOWS` marker block. The previous marker-first file had no frontmatter, so jeopi ignored it (a project without the rule answered "none" to a codeword probe; the same text with frontmatter answered it). A legacy marker-only file is migrated in place, foreign frontmatter keys and text are kept, and an existing `alwaysApply: false` is set to `true` for this installer-owned filename. The rule's openspace fallback now calls the OpenSpace venv interpreter (the system `python3` cannot import `openspace`), and `.mex/ROUTER.md` is read only when it exists.
- `setup-workspace.py --verify` re-checks the global rule, the project rule and the `AGENTS.md`/`CLAUDE.md` pointer read-only (`ok`/`inert`/`stale`/`missing`, exit 1 when a rule would not be applied). `install.sh` runs it after workspace activation and ends with a failed status instead of reporting inert rules as active. `setup-all-skills-prompt.md` Step 5B now runs the helper, activation and `--verify` explicitly, because the guide's Steps 1–7 never called `install.sh`; its pinned installer digest is updated to match.
- `route-hooks.py status` prints a `stale` line when the installed router copy differs from the skill's `route_prompt.py`, because a hook for a newer host (jeo's `--host jeo`) is silently inert against an older router. Verified with a real `jeo` 0.12.23 run: the hook's note reached the model with routing on and was absent with `OPENSPACE_ROUTE=off`.

## 2026-11-04

### Added
- `openspace` routing hook installer (`scripts/route-hooks.py`) now discovers and wires redirected Claude Code and Codex configuration homes (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, and Orca profile/runtime/account homes under `ORCA_USER_DATA_PATH`: `claude@orca-*`, `codex@orca-runtime`, `codex@orca-*`) when those homes already contain `settings.json` or `hooks.json`.
- Added regression tests in `scripts/test_performance_regressions.py` and `scripts/test_openspace_routing.py` covering `copy_tree` unchanged-file fast-paths, `__pycache__`/`.DS_Store` exclusion, and Orca/environment-redirected hook installation.

### Changed
- Optimized installer memory and I/O in `.agent-skills/jeo-skill/scripts/install_support.py`, `.agent-skills/jeo-skill/scripts/jeo-skill.py`, and `install.sh`: `_sha256_file` and `_copy_and_hash_file` stream through a reusable 256 KiB `bytearray`/`memoryview` buffer (`readinto`); `require_safe_tree`, `dir_manifest`, `copy_tree`, and `_retired_reason` use iterative `os.scandir` traversal instead of recursive `Path.rglob("*")`; `copy_tree` skips rewriting destination files whose size, mtime, and SHA-256 already match; `command_search` uses `heapq.nsmallest` and short-circuits `--limit 0`; `command_bootstrap` links `~/.local/bin/jeo-skill` in-process when invoked from the installed router; and `install.sh` exports `PYTHONDONTWRITEBYTECODE=1`.
- Optimized `.agent-skills/openspace/scripts/route_prompt.py` to avoid allocating per-skill term sets across the entire catalog prior to BM25 scoring and to serialize `index.json` compactly.
- Cleaned untracked local agent directories, stale session/cache directories, retired empty skill folders, build artifacts, `__pycache__`, and `.DS_Store` clutter from the repository checkout, and isolated subprocess stdin (`stdin=subprocess.DEVNULL`) in `scripts/test_installer_regressions.py`.

## 2026-11-02

### Fixed
- Repaired skill reference destinations without moving source documents. Historical generated documentation now links to its archived revision; unresolved cross-skill routes are identified rather than assigned invented replacements.
- Strict link scans use the same policy identity for absolute and relative scan roots, distinguish inline Markdown examples from real links, and bind explicit exceptions to source line, rule, and target. Ambiguous legacy line exceptions and duplicate normalized targets fail closed; legacy raw-target entries remain global for compatibility.

### Added
- CI now runs scoped strict-link validation and the scanner regression suite. The existing R-2 deferred batch remains out of scope; five missing example images in that batch are not claimed fixed.
- Added a reproducible fixed-evaluator link-exception ratchet under `.frontmatter/link-exception-ratchet/`. The unchanged safety rubric improved from 3/5 to 5/5, with rejected candidates retained in the log. In a local paired synthetic 2,000-exception workload, the reviewed baseline and final scanner medians were 0.375 s and 0.098 s; full-catalog medians were 0.667 s and 0.651 s. These are fixture measurements, not production guarantees.
- Added account-aware Ouroboros model setup using native Codex, Copilot and Kiro discovery instead of bundled static model snapshots. Model configuration previews by default and requires explicit apply; validated changes preserve unrelated settings and create private backups. Native catalog visibility is distinguished from live entitlement and inference verification.

## 2026-11-01

### Added
- Added `--setup` (with an explicit allowlist `SUPPORTED_SETUP_SKILLS`) and `--with-hooks` (which exports `JEO_SKILLS_APPROVE_ALL_HOOKS_MCP=true`) to `jeo-skill install`. It runs bundled CLI/smoke verification for supported skills (`open-ontologies`, `okf-agent-memory`, `mex`, `openspace`, `ooo`, `rtk`, `cli-anything`, `spec-kit`, `ecc`, `jev-control-plane`, `graphify`, `semble`, `zvec-grep`, `llm-wiki`) and explicitly skips unsupported ones. `--dry-run` executes zero subprocesses and writes zero files.
- Added `--skip-mcp` to `install-openspace.sh` and wired it into `jeo-skill install openspace --setup` and `scripts/install-full-tools.sh`, preventing unintended host MCP registration during setup without `--with-hooks`. Preserved the upstream `ooo` and `openspace` independent installation structure from v2.0.
- Added `--extended` mode (10/10 tools) to `scripts/install-full-tools.sh` covering `Graphify`, `OpenSpace` (BM25 probe), `Open-Ontologies` (`smoke.py`), and `OKF-Agent-Memory` (`smoke.py`) while preserving the 6/6 default baseline.
- Packaged `hooks/ctx/lock.py`, `hooks/ingest-output.py`, and `hooks/ingest-prompt.py` in the repository with real `fcntl.flock` fallbacks. Turn-end events (`Stop`, `AfterAgent`, `post-turn`) with output payloads delegate to `ingest-output.py` under the vault layer lock, capturing visible text only (filtering `thinking`/`tool_use`). File collisions are eliminated with `capture_id` and exclusive creation (`"x"` mode), raw captures use non-mutating outer fences, and lock contention defers indexing to `.state/deferred-index.jsonl` with automatic reconciliation on the next unlocked run.

### Changed
- `scripts/install-full-tools.sh` now installs the unambiguous `~/.local/bin/mex-agent` wrapper (prioritizing active npm and newest nvm Node ahead of TeX Live `mex`), automatically links `~/.local/bin/rtk -> ~/.cargo/bin/rtk` (`1.1.0`), and supports multi-agent `SPEC_KIT_INTEGRATION` (`auto` or comma-separated) with staging and absent-only atomic merge.
- Bound all 10 detected coding agent hosts to independent profiles in `~/.agents/jev/agents.json`, switched `echo-turn-jeopi` to `runtimeMode: assist` for automated skill instruction injection, and updated Claude Code `ecc@ecc` plugin to `2.2.3` with Jev proposal reviews.

## 2026-10-30

### Added
- Added the `impeccable` operator v1.0.0 for `pbakaus/impeccable` skill 4.8.0 / engine 0.1.18 at `02523aec3e4c4580102d996d1b6a71fbe062e03f` (Apache-2.0; LICENSE and NOTICE.md inspected, license copied as `LICENSE.upstream.txt`). It routes the 24 upstream commands, carries a paraphrased critique/audit method and craft floor for use without the upstream skill, documents the 62-rule detector, and gates npm execution, engine download/runs, the unsandboxed design hook, browser scans and live mode separately. Stdlib `scripts/doctor.py` inspects installs (upstream vs catalog operator under the same `impeccable` folder name), engine candidates in launcher order with optional pinned-digest checks, hook manifests, telemetry opt-outs and project context without executing anything; `scripts/triage_findings.py` ranks `detect --json` findings and routes them to commands without echoing snippets. `references/source.json` pins commands, checksums, rules and 19 selected file hashes. Catalog: 408→409 (`web/design`, `web-design` relationship group). New tests pass 22/22; installer 72/72 and setup-guide 34/34 pass on Node 24. Nine routing/safety evals are authored, not executed.
- Runtime-verified `impeccable` in a throwaway `HOME` on macOS arm64: the public catalog install was byte-identical to the repository folder; the pinned launcher downloaded engine 0.1.18 whose SHA-256 matched the pinned digest via `doctor.py --verify-digest`; the binary's `detect --list-rules --json` matched all 62 rules in `source.json`; a real `detect --json` run (exit 2, 19 findings) matched the documented finding schema and fed `triage_findings.py`. Triage now lists distinct sample locations (static HTML reports `line: 0`). URL/CDP scans, hooks, live mode, the npm route and Linux/Windows assets remain unverified.
- `openspace` v2.0: prompt-time skill routing for every host and model. `scripts/route_prompt.py` ranks the installed catalog with OpenSpace's `SkillRanker.bm25_only` (no LLM, no embeddings, no network) before the model runs and passes at most three matches (name, `SKILL.md` path, description) as context; a gate suggests a skill only when the prompt names it, or when a rare prompt term appears in its frontmatter and it covers half of the prompt's content terms, with Korean particle stripping, Latin/Hangul splitting and per-script rarity. `scripts/route-hooks.py install|remove|status` wires Claude Code and Codex (`UserPromptSubmit`), Gemini CLI/Antigravity (`BeforeAgent`), Kimi Code, jeopi/omp/pi/gjc (`before_agent_start` extension) and OpenCode (2.x `session.hook("prompt")`, 1.x `chat.message`) through one fail-open wrapper. On the 764-skill catalog, 33 labeled English/Korean prompts that should route and 24 that should not: a correct skill for 26, silent on 23 of 24; about 0.3 s per prompt with the cached index. Live with an `OPENSPACE_ROUTE=off` control: Claude Code, jeopi (`gpt-6.1-terra`, `gpt-5.6-sol`, `claude-haiku-4-5`) and omp (`gpt-5.6-sol`) received the note.

### Changed
- `ponytail` v2.0.0: rebased on upstream Ponytail 5.3.3 (`7801d061243d7b753bad0e0b3c057cd250b11755`, MIT, license copied as `LICENSE.upstream.txt`): codebase reuse before stdlib, every broken caller finished, one small check for risky logic, replies ending with what was skipped and any risk, `ultra` pushing back on the request, `shortcut:` markers (older `ponytail:` still harvested), full-quality `/ponytail-review` and `/ponytail-audit`, and `/ponytail-gain` with the pinned benchmark (−53% code, −26% cost, −41% time) replacing the 80–94% claims. `references/commands.md` and `scripts/install.sh` cover every upstream plugin host, settings and uninstall; `APPLY=1` runs one host only. Moved from `cli-tools/ai-cli` to `engineering/code-quality`. Removed the 2 MB demo GIF, the nonexistent `skills serve` MCP setup, OpenCode file-path plugin lines that OpenCode 2 rejects, invented changelog dates and duplicate category/tag metadata; install payload 2.03 MB → 33 KB. Claude Code and omp installed plugin 5.3.3 through the new installer in isolated homes.
- `caveman` v2.0.0: follows the maintained `JuliusBrussee/caveman` 4.0.1 (`d262ab3882952a59312ff3537cd86d894523c5ab`, Apache-2.0, license copied, changes stated) instead of the copy credited to `mattpocock/skills`, which removed it; the unsourced “~75%” claim and generic filler sections are gone. `scripts/test_ponytail_caveman_skills.py` (12 tests, added to CI) checks pins, versions, links, legacy payload and the installer contract.
- OpenSpace and `ooo` install independently: `ooo/scripts/install.sh` no longer checks, stages or searches with OpenSpace (`--search` and `--ensure-openspace` are usage errors), and the setup guide's ooo block no longer prepares it. OpenSpace has its own guide section with separate approvals for installation (`JEO_SKILLS_APPROVE_OPENSPACE`) and routing hooks (`JEO_SKILLS_APPROVE_SKILL_ROUTING_HOOKS`). `scripts/test_openspace_routing.py` (24 offline tests plus `--real-openspace`) and `scripts/test_ooo_installer.py` (5) replace `test_openspace_ooo_integration.py` in CI.

### Fixed
- `mex` v1.2: `scripts/install.sh` no longer stops after `mex setup` on mex-agent 0.8, which exits 2 while scaffold population is pending. It passes `--yes --tool <tool>` (and `--force`) to mex-agent >= 0.8, keeps the piped menu for 0.7.x, reports exit 2 with the `mex-agent setup next --start` next step and continues to the `AGENTS.md` bridge, graph and check, and stops on any other setup failure. A missing mex-agent is installed as `mex-agent@0.8.5` (`MEX_AGENT_NPM_SPEC` overrides). Verified with the real mex-agent 0.8.5 in a throwaway `HOME`.
- `obsidian-second-brain` v1.0.1: `WITH_UPSTREAM=1` no longer aborts on macOS `/bin/bash` 3.2 under a UTF-8 locale (`"$dest…"` parsed as an unbound variable). With `GLOBAL=1` the upstream checkout now replaces the routing-skill link that `npx skills add -g` creates at `~/.claude/skills/obsidian-second-brain` (only after a successful clone), an existing upstream checkout survives re-runs instead of being deleted by `npx`, other directories are refused, and a missing `git`, failed clone or refusal exits 1 instead of printing `Done`. The aliases report tolerates an upstream `SKILL.md` without an aliases line. Verified with the real `skills@1.7.0`, `git` and `/bin/bash` 3.2.
- `devup-ui` v1.0.1: braced the same `$pm…` expansion. `scripts/test-runtime-config-writers.sh` scans tracked shell scripts for unbraced variables directly before non-ASCII text and covers the obsidian upstream cases under a UTF-8 locale; `mex/scripts/test-runtime.sh` covers mex-agent 0.8 setup.
- `openspace` installer: pins the checkout to the verified commit (`GIT_REF=main` follows upstream), rebuilds a venv whose base Python was removed (`uv venv --clear`), installs `rank-bm25`, `PyYAML` and `mcp>=1,<2` (MCP SDK 2 removed the `mcp.server.fastmcp` module `openspace-mcp` imports, so an unpinned install could not start), and checks the router contract before copying host skills.
- `openspace` MCP registrar: Gemini CLI and Qwen Code entries no longer carry `toolTimeout`, which their strict settings schema rejects at startup; existing entries with it are repaired without `--force`.

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
