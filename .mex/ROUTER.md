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
  - target: context/knowledge-pairings.md
    condition: when checking code-to-knowledge pairings, query history links, or active work memory
  - target: patterns/INDEX.md
    condition: when starting a task — check the pattern index for a matching pattern file
last_updated: 2026-11-17
---

# Session Bootstrap

If you haven't already read `AGENTS.md`, read it now — it contains the project identity, non-negotiables, and commands.

Then read this file fully before doing anything else in this session.

## Current Project State

**Working:**
- 2026-11-17 JEO Trinity (`jeo-code` × `jeopi` × `jeo-skills`) `qev:8017` + 그래프 DB + OAuth/런타임 통합:
  - `jev/jev-harness.mjs` & `jev/jev-setup.sh`: `local_calibrated` 등급(`CALIBRATION_MIN_RATE=0.85`, `--golden --save-calibration`), `manage-memory` 중요 블록(`Constraint`/`Decision`/`memory`/`schema vN`) 드롭 보호, `route-skills --fast` (`JEV_FAST_ROUTE=true`, `gate::prose_suffices` 단일 게이트 + top-3 `fits`로 3576ms→555~1074ms 단축), `--migrate-qev`/`--auto-model`/`--install-daemon` 및 `com.jeo-skills.qev-server` launchd 데몬(`-np 1 --no-kv-unified`) 부트스트랩·14개 프로필 교정(`tpr=1, tnr=1`).
  - 공유 `.jeo/db/jeo.db` & `llm-wiki` 브리지: `jeopi/packages/mnemopi/src/db.ts` `defaultCodeDbPath()`를 `.jeo/db/jeo.db`로 통일(+ `.jeopi/db/jeo.db` 자동 이관), `jeopi`/`jeo-code`/`scripts/jeox.py` 인덱서에 `@wiki/...` 프로젝트 문서·백틱 심볼 `references` 엣지 브리지(temp workspace 격리 유지) 및 `qev:8017` Noul `rerank` 추가.
  - OAuth 풀 & 429 쿨다운 브리지 + `qev` 모델 라우팅: `jeo-code/src/auth/shared-pool-bridge.ts` + `jeo auth sync`, `jeopi/packages/ai/src/shared-cooldown-bridge.ts`로 mode `0600` `~/.agents/auth-pool/cooldowns.json` 양방향 429 공유; `jeo-code/src/agent/prompt-router.ts`에 fail-open `escalateToQev` 추가 및 `~/.jeo/config.json` `routing.enabled=true`.
  - 런타임 7유스케이스 배선: `jev/jev-plugin.mjs` (`JEV_PRETOOL_OP=gate-tool`, `PostToolUse`, `DecideAction`, `EvaluateRun`, `JEV_MODEL_ROUTING=auto`, `jeo-preprompt`, `jeo-posttool`), `jev/plugins/*/shared/jev-controller.mjs` 6개 바이트 동일 동기화(`tool_result`, `goal_updated`, `agent_end` 1-retry, 조건부 `jev_decide`), `jeo-code/src/agent/jev-tools.ts` + `task-tool.ts` 및 `~/.jeo/hooks.json` 등록.
- 2026-11-16 NVIDIA SkillEvaluator catalog security remediation: audited all 440 skills in `.agent-skills/` via `skillevaluator security-scan` (`0.8.0` / `SkillSpector 2.13.3`) across parallel subagent batches (`RemediateBatch01–10`, `PolishBatchA–C`, `LiveScan1–4`) plus `agy` (`gemini-4-carbon-high`) and Jev (`jev-harness.mjs`). Measured BEFORE -> AFTER (`skillevaluator-security.json`, 440/440): passed 221 -> 366, failed 192 -> 63, incomplete 27 -> 11; zero-CRITICAL/HIGH skills 248 -> 377/440 (85.7%); CRITICAL findings 4 -> 0, HIGH 956 -> 290, MEDIUM 1296 -> 647, LOW 61 -> 12, with LP1/E2/AE1/LP3/SC8/SC9 cleared. Post-audit review repaired `agent-manager/scripts/install.sh` (`fi`), `agent-manager/evals/evals.json`, `lightpanda/evals/evals.json`, and `animato/SKILL.md` + `animato_agent.py`. Kept 32 shared `scripts/preflight.py` helpers byte-identical (`sha256` `ddf0bc5f5f98b758`), synced manifest descriptions, regenerated projections, and updated READMEs + changelogs + `setup-all-skills-prompt.md`.
- 2026-11-16 full install: 440/440 catalog skills synced in shared root `~/.agents/skills` (`missing=0`, `diff_skill_md=0`, `~/.local/bin/jeo-skill` byte-identical to repo) via `scripts/skills-upgrade.sh --skip-pull --replace-copies`; non-catalog skills preserved.
- Host roots `claude`, `pi`, `gjc`, `antigravity`, `cursor`, `aside-user`, `opencode-config` are per-skill symlinked to `~/.agents/skills` with `broken_links=0` across all 7 roots.
- 2026-11-17 Jev metadata-aware routing, SSOT indexing, OpenSpace prior/fallback, 3-tier assist & README sync (`4c3da180` + `220ff7fb` + `eddf38b4`+): upgraded `jev/jev-harness.mjs`, `jev/jev-plugin.mjs`, `.agent-skills/openspace/scripts/route_prompt.py`, `scripts/setup-workspace.py`, `scripts/skills-upgrade.sh`, `README*.md`, `jev/README.md`, and `changelog/{en,ko}/2026-11.md` / `CHANGELOG.md` with `.agent-skills/skills.json` (`relationship_groups`, 440 skills) SSOT + `SKILL.md` auxiliary frontmatter indexing, `SKILL.toon` / fenced-code-aware excerpting, `budgetCandidates`, bilingual KO/EN BM25+IDF prefiltering unified with OpenSpace BM25 prior (`OPENSPACE_PRIOR_WEIGHT=3.0`) & outage fallback, enriched `route-skills` `topK` output, 3-tier hierarchical `assist` injection, and all 7 System One CLI commands (`decide-action`/`gate-tool` tier-gating preserved). Synced to `~/.agents/jev/`.
- `scripts/skills-upgrade.sh` (pull → doctor → shared-root refresh → prune-retired → link reconcile → verify) runs end-to-end with PASS; `scripts/refresh-host-links.py` is idempotent (re-run = empty plan); cron-safe PATH fallback for npx
- Weekly launchd job `com.jeo-skills.skills-upgrade` installed (Monday 09:30, logs in `~/.local/state/jeo-skill/upgrade.log`)
- Catalog projections validate; root `.gitignore` covers everything by default
- 2026-11-13 main-only consolidation: source catalog is 432 skills after preserving the local `agenticskills` removal on latest `origin/main`. Deleted nine local and three origin branches after a complete-history bundle backup under `~/.local/state/jeo-skills/backups/main-only-20261113-165751/`; only `main` remains. Six temporary worktree directories were already absent, so only their stale registrations were pruned; their former uncommitted edits are not in the backup. Existing local notes and asset drafts remain uncommitted. English, Korean and Spanish READMEs now distinguish installation, setup, observed usage and runtime activation; generated projections, strict scoped links, frontmatter, flat layout, router doctor and install previews passed.
- 2026-11-13: added `nvidia-skill-evaluator` at upstream `12b387f7a62b5f3e0de9eff392a3f6b7e952f2c2`; source catalog 432 skills. Standards, catalog projections, 15 focused offline tests, 12 selected-source hashes and isolated-HOME five-file installation passed. The initial real-manifest smoke caught raw-versus-blob URL drift; a shipped-manifest regression now guards that boundary. This is operator/support verification, not an evaluator, scanner, provider or Tier 3 runtime claim.
- 2026-11-13: added `donchitos-game-studios`, a pinned operator for the Donchitos game-project template; catalog 433. The [research](../.agent-skills/donchitos-game-studios/references/research.md) separates 75 canonical workflows and three aliases from 78 independent packages. Eighteen offline tests, 12 selected hashes, guide standards and isolated-HOME ten-file installation passed. Quality-check is 92.8 with publication incomplete; no engine/browser/agent/scanner runtime or paired lift is claimed. See [quality-check interpretation](patterns/skill-quality-triage.md) before bulk edits.
- 2026-11-10: published `revfactory-harness` v1.0.0 to remote `main` at `a3eb7dd2`, bringing the source catalog to 427 skills. Upstream `revfactory/harness` v2.1.0 is pinned at `92d9f1b29e7af81acebf51a9fcd1832e739a1414`; the existing `harness2` and retired `harness` mapping are preserved. New offline suite: 33/33; standards, catalog, scoped links, and a real isolated-HOME installation passed. No user-root installation, Claude plugin activation, or paid run was performed. The original checkout remains on the user's `feat/craft-anything-skill` branch; implementation used `/tmp/jeo-skills-revfactory-harness`.

**Not yet built:**
- No `update`/`sync` command inside the `jeo-skill` router CLI itself (upgrade flow lives in `scripts/skills-upgrade.sh`)

**Known issues:**
- CRITICAL: after symlink conversion, never re-run per-host copy targets (`jeo-skill install -a claude-code` / gjc / antigravity) — installer rmtree can follow symlink slots and delete shared-root originals. Shared-root refresh + `refresh-host-links.py` only.
- Stale-opencode and stale-cursor copy cleanup matters: catalog-matched stale copies reappear if someone re-runs per-host copy installs (see `refresh-host-links.py --replace-copies` to quarantine + convert)
- `opencode-config` host intentionally not in default link set (openspace already serves shared root; adding links would double-list skills)
- Version numbers and statuses are point-in-time claims; re-verify before relying on them. Details belong in `context/` files.## Routing Table

Load the relevant file based on the current task. Always load `context/architecture.md` first if not already in context this session.

| Task type | Load |
|-----------|------|
| Understanding how the system works | `context/architecture.md` |
| Working with a specific technology | `context/stack.md` |
| Writing or reviewing code | `context/conventions.md` |
| Making a design decision | `context/decisions.md` |
| Setting up or running the project | `context/setup.md` |
| Any specific task | Check `patterns/INDEX.md` for a matching pattern |

## Behavioural Contract

For every task, follow this loop:

1. **CONTEXT** — Load the relevant context file(s) from the routing table above. Check `patterns/INDEX.md` for a matching pattern. If one exists, follow it.
2. **BUILD** — Do the work. If a pattern exists, follow its Steps. If you are about to deviate from an established pattern, say so before writing any code — state the deviation and why.
3. **VERIFY** — Load `context/conventions.md` and run the Verify Checklist item by item. State each item and whether the output passes. Do not summarise — enumerate explicitly.
4. **DEBUG** — If verification fails or something breaks, check `patterns/INDEX.md` for a debug pattern. Follow it. Fix the issue and re-run VERIFY.
5. **GROW** — After meaningful work, run this binary checklist:
   - **Ground:** What changed in reality? Name the changed behavior, system, command, dependency, or workflow.
   - **Record:** If project state changed, update the "Current Project State" section above. If documented facts changed, update the relevant `context/` file surgically. Record a new behavioral claim about specific code as its own entity (`mex wiki apply` with a `create-entry` operation), grounded to every symbol whose change could make it false and naming the identifiers and literals it depends on.
   - **Connect:** Link section entities to their enclosing knowledge with `refines` using existing ids. Preview missing structural links with `mex wiki link-sections`, then apply explicitly. Review semantic relationships from evidence; do not connect records just because they share keywords or code groundings.
   - **Orient:** If this task can recur and no pattern exists, create one in `patterns/` using `patterns/README.md`, then add it to `patterns/INDEX.md`. If a pattern exists but you learned a gotcha, update it.
   - **Write:** Bump `last_updated` in every scaffold file you changed. Read `mex logging --json` before optional `mex log` notes: `significant` records material rationale, `checkpoints` batches useful notes at task/session boundaries, and `manual` avoids unsolicited notes. Honor explicit user log requests in every mode; mandatory workflow Activity and recovery audits remain required.
