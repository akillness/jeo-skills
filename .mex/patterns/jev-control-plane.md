---
name: jev-control-plane
description: Runbook for the Jev System One control-plane harness — five backend kinds, per-operation routing with allow-list fallback, attestation tiers, cap-aware skill selection, advisory host routing, and the test/evidence gates that prove each claim.
triggers:
  - "jev"
  - "jev-harness"
  - "route-skills"
  - "prune-context"
  - "review permit"
  - "JEV_MODE"
  - "systemone"
  - "model_policies"
  - "model-plan"
edges:
  - target: "context/architecture.md"
    condition: "for where the optional Jev flow sits next to catalog distribution"
  - target: "patterns/catalog-metadata-changes.md"
    condition: "when editing skills.json model_policies (manifest is the single source of truth)"
  - target: "patterns/jeo-skill-install-flow.md"
    condition: "when Jev setup interacts with the catalog installer"
grounds_to: []
last_updated: 2026-10-16
---

# Jev Control Plane Runbook

## Debugging host model-plan CI failures (2026-10-16)

1. Reproduce the exact failing CLI test with isolated HOME and
   `JEV_LIVE_SMOKE=0`; preserve runner exit status, Node/Bun versions and source
   hashes. A missing option can indicate missing policy implementation, not a stale
   test: never remove inventory/auth/quota tests just to make CI green.
2. `--host-models` is an explicit observation file, not a collector or permission
   grant. Match agent/profile, require strict ISO calendar/time values, and check
   freshness after both inputs and immediately before returning. Never turn a
   malformed quota into an expired/free quota via permissive date parsing.
3. Intersect approved advice with exact provider/model observations and
   `authenticated: true`; keep OAuth identities distinct and skip unavailable or
   quota-limited candidates in supplied order. Return host-native argv and ordered
   fallbacks, always advisory and unexecuted. OFF skips both inputs.
4. Regressions must cover invalid/leap dates, expiration during reads and ranking
   with a deterministic child-only clock, malformed auth/quotas, oversize files,
   directories and leaf symlinks. Both JSON inputs are capped at 1 MiB; errors
   must not echo file contents or credentials.
5. Run the complete six-file Node command below, then the remaining installer and
   catalog gates. A missing local Bun PATH is an environment failure to correct,
   not a reason to skip its test. Check the pushed SHA in all three GitHub Actions
   jobs (catalog, Ubuntu installer, macOS installer); local passes are not remote
   evidence. No installed runtime resync, provider call or model launch is implied.
6. A later macOS gate can expose test-owned temp aliases such as `/var`. Resolve
   only the trusted `TemporaryDirectory` fixture base before constructing valid
   control repos. Never resolve caller-supplied repo paths or weaken root/parent/
   leaf symlink rejection to compensate. Keep a deterministic aliased-temp-base
   regression so Linux/local runs exercise the same condition.

README/runtime audits must compare source and installed harness bytes before
assuming test results cover the active installation. A rounded Choice response
with probability sum 0.99 is a useful loopback compatibility probe: current
source renormalizes small drift, while an older installed harness rejects it.
Check legacy status separately from per-agent controller status; configured API
credentials and copied rule/package files do not prove readiness, profile ON,
host registration, or action enforcement. The initial audit found advisory-only
callbacks; the later runtime integration adds opt-in assist and Codex review modes. Latest evidence: `../context/jev-readme-audit.md`.

Source of truth is `jev/` in this repo: `jev-harness.mjs` (Node ESM, built-ins only), `jev-setup.sh`, `jev_local_server.py`, `jev-control-plane.rule.md`, `README.md`; portable skill `.agent-skills/jev-control-plane/SKILL.md`. Design record: `.survey/jev-model-routing/` (gitignored research + `design-options.md`, interview-approved 2026-10-08).

**Installed copy vs repo.** `jev-setup.sh` copies `jev/` into `~/.agents/jev/`. On 2026-10-01 fixes were applied directly to the *installed* copy and never ported, so the two diverged (sha1 `f835f55…` installed vs repo). The repo rewrite of 2026-10-08 supersedes it; resync with `bash jev/jev-setup.sh --mode <kind>` (home-scoped, user-approved). Never edit `~/.agents/jev/` by hand again.

## Runtime activation verification (2026-10-14)

1. Configure a named profile through the source controller with `--runtime-mode assist`
   and the intended `--review-mode` (`off`, `advisory`, or explicit `enforce`).
2. Compare installed/source runtime bytes after setup; test from an empty directory
   so a working checkout cannot mask a missing installed catalog or skill file.
3. Codex: merge with `hooks-install`, review exact definitions through `/hooks`, and
   require `hooks/list` to report trusted+enabled before claiming activation. Trust
   uses server-computed hashes; never invent them. Preserve unrelated hook indices.
4. Verify a fresh host session identifies injected source paths without reading files,
   then run one harmless tool and inspect the actual PreToolUse review context.
5. Run all six Node suites (install/plugin/profile/runtime/lifecycle/codex) and Python
   Jev/installer regressions. Include split UTF-8, malformed mapping/config and
   unavailable/unvalidated enforcement cases. Keep live-provider evidence separate.
6. Native context pruning must preserve the latest skill message and all non-Jev
   history, and skip excluded blocks when input bounds are exceeded.

Actual application and current limitations: `../context/jev-runtime-activation.md`.

## Architecture (2026-10-08)
- **Backend kinds** `BACKEND_KINDS = api | local | ollama | lmstudio | systemone` — one registry in the harness; `jev-setup.sh` and `install.sh` validate against the same five names.
  - `api` → TypeSafe `POST /v1/systemone {state, model, questions}` (driver `typesafe`).
  - `systemone` → `JEV_SYSTEMONE_DRIVER=typesafe|decide|vllm-jev-decision`: TypeSafe-compatible shim (e.g. openjev), AutoTrust `serve_decide.py` `/v1/decide` (sent with `thinking:"off"`; 2–256 options; `GET /v1/decide/info` for status), or vLLM `jev-decision` LoRA via `/v1/completions` logprobs + `decision_head.json`/`calibration.json`.
  - `local` → `jev_local_server.py` (base `AutoModelForCausalLM` yes/no logits — System 2, **never** the decision head). `ollama`/`lmstudio` → JSON-from-chat (System 2).
- **Per-operation policy** in the profile base file: `JEV_<OP>_BACKEND` (`ROUTE_SKILLS|PRUNE_CONTEXT|REVIEW`), `JEV_<OP>_FALLBACK=kind,kind` (ordered allow-list; nothing else is ever tried), default `JEV_MODE`, CLI `--backend <kind> [--model <id>]` (override skips fallbacks). Eligibility = that profile's `<id>.<kind>.env` exists (api: key present). No cross-profile fallback.
- **Tiers.** Every kind is `unvalidated`. `validated` only when `JEV_<KIND>_VALIDATED_MODEL` equals the model id the backend **reports serving in the response** *and* the driver is calibrated-head (`typesafe`, `decide`, `vllm-jev-decision`). `generative`/`local` drivers are permanently ineligible (`attestation.eligible:false`). `review` downgrades `permit` → `proposal_only` on any other tier. Receipt v2 = sha256(`{v:2, task, proposal, decision, backend:{kind, model, tier}}`).
- **State bounds** (`maxStateChars`, enforced in the dispatcher *before* I/O; never trims): local/ollama/lmstudio 6,000; decide/vllm 3,000; api/typesafe 100,000. Oversized ⇒ that kind fails ⇒ only the explicit chain may try a bigger backend. `prune-context` plans batches under the limit (oversized single block ⇒ `keep` + `reason`).
- **Scoped question state.** A question may carry `state`; batch drivers send one request with the shared state, per-question drivers and `local` are called once per distinct scoped state (`groupByScope`). Gate Nouls see `{request}`, each `fits::<name>` sees only its candidate, `which` sees the budgeted full set (`budgetCandidates` shrinks excerpts→descriptions by measurement; irreducible overflow throws).
- **Selection** (`route-skills`): strategy = `ceil(N/choiceCap) ≤ 4 ? sharded : shortlist`. Sharded: per-shard Choice + 3 gate Nouls (gate enforced **once**), top-3 finalists per shard (shard probabilities are never compared across shards), then Choice over finalists + `fits::` Nouls. Shortlist: stopword-filtered lexical top-12 → gate + `which` + `fits`. Thresholds `GATE_THRESHOLD=FITS_THRESHOLD=0.30` (cookbook defaults, uncalibrated here). Empty ⇒ `topK: []` + `selection.reason` (`gate|fits|shortlist-empty`) + `publicRegistryFallback`.
- **Advisory host routing** (`routing` field): manifest-only `model_policies` provides approved provider/model candidates. The controller can render host-specific launch argv from that advice, but never executes it or replaces the host model. It remains separate from decision-model attestation and is not projected into TOON/README.
- **Status**: per-operation chains with `usable`; exit 3 only when a chain has no usable backend; `--operation <op>`; probe timeouts are `state:"warming"`, refused/5xx `unavailable`, malformed discovery JSON `unavailable`. Compatibility fields `mode`/`endpoint` retained.

## Commands
```sh
node jev/jev-harness.mjs self-test --mock                     # 20/20 offline contract checks
JEV_LIVE_SMOKE=0 node --test jev/install.test.mjs jev/plugin.test.mjs jev/profile.test.mjs jev/runtime.test.mjs jev/lifecycle.test.mjs jev/codex.test.mjs # live smoke stays opt-in
python3 -m unittest scripts.test_jev_regressions               # 64 loopback regressions (documented wire shapes)
python3 -m unittest scripts.test_installer_regressions         # 48 installer regressions
node jev/jev-harness.mjs status [--operation review]           # exit 0/2/3
node jev/jev-harness.mjs route-skills [--backend K] [--model M] [--top-k N] "<task>"
node jev/jev-harness.mjs prune-context < blocks.jsonl
node jev/jev-harness.mjs review "<task>" '<proposal-json>'
node jev/jev-harness.mjs smoke [--backend K] [--task "<text>"]  # live, never authorizes
```

## Gotchas

- Native timeout regressions must not assume a child has installed signal handlers
  within a short wall-clock deadline. Register SIGTERM handling before publishing
  a readiness marker, mock only parent `setTimeout`, wait for readiness, advance
  deadline then wait for TERM receipt, and finally advance kill grace. Keep an
  independent real-time bound for polling actual process death and register
  unconditional cleanup for failed assertions. Do not lengthen production
  timeouts or remove SIGKILL/orphan checks to silence a loaded-CI race.
- Capture test logs with the runner's exit preserved (`set -o pipefail; cmd > log; echo $?`), then grep the log. Piping into `grep`/`tail` reports the filter's exit, not the runner's.
- The regression fixture must speak the **documented** shapes (422 without `model`; Choice `criteria`; `noul` answers). A fixture that mirrors the harness's assumptions hides wire mismatches — that is how the `api` path stayed broken for weeks.
- `/v1/decide` state is sent as the raw object (the server `json.dumps` dicts itself). `thinking` must be `"off"`; a response with `thinking.used: true` is rejected.
- Live Ollama is slow and serial: aborted client requests keep generating server-side, so a stuck first call queues everything after it. Run `smoke` with nothing else hitting Ollama; a cold model load is ~9 s, a warm Noul ~0.5 s, a full route on the 9B Q4 chat path ~3 min.
- Legacy `~/.agents/jev/.env` shares `JEV_LOCAL_MODEL` between `local` and the generative kinds; the harness only honors it for `local` when the file is local-scoped.
- Two legacy tests (`empty/partial saved config ⇒ exit 3`, `ambient JEV_MODE switch cannot deactivate a saved opt-in`) were already failing at HEAD before this work; the rewrite satisfies them instead of weakening them.
- HF model-card reads: use `read(...:raw)` for source files (`vl/serve_decide.py`); a non-raw child URL returns the card.
- Residual (unvalidated generative tier only): the Q4 chat path still answers polarity-negative review questions "yes/0.95" (same as the 2026-10-02 audit). Safe by construction (`permit` impossible on that tier) but the `proposal_only` reasons are noisy. The 2026-10-01 installed-copy "ask positively and invert" workaround was deliberately not ported — calibration work belongs with a validated head.
- Hosted live checks: capture CLI stdout/stderr privately before emitting a safe
  whitelist. Non-2xx provider text can appear in the harness error envelope; never
  print it unfiltered. A disposable fetch observer must disable redirects and persist
  its attempt count before I/O, so a killed process cannot leave a false zero count.
- `route-skills` needs a catalog. An explicit `JEV_CATALOG_PATH` is authoritative and fails closed when invalid; native hooks pin the trusted installed snapshot and never fall back to an arbitrary CWD. Standalone CLI discovery may otherwise use the checkout, installed snapshot, or legacy clone. Verify installed routing from an empty CWD rather than hiding missing assets with the repo's catalog.
- Excerpts are sent to the backend: `skillExcerpt` checks containment on `realpath` (catalog `../` paths and in-root symlinks to outside files are both refused). The user's `~/.agents/skills` has ~93 symlinked dirs (other sources) that resolve outside the root; none are catalog skills, so no excerpt is lost.
- An isolated-HOME live install must not symlink the real `~/.agents/skills`: setup then finds the real `jeo-skill` router and runs `npx skills add --agent <profile>` (network; fails for a non-agent profile id). Copy SKILL.md files instead.
- Native advisory packages exist for Claude, jeopi, OMP, and Pi. Session loading does not register a persistent plugin; `host-plan` emits literal session argv and reports registration prerequisites without executing them. `JEV_ENABLED` alone controls profile ON/OFF; an OFF registered hook short-circuits before stdin/catalog/backend/host work. Other hosts receive adapter or unsupported plans, not invented native package paths.
- Standalone setup preflights the root `~/.agents/jev/jev-plugin.mjs` destination and raw-native file leaves before staging or publication. Root-controller symlinks/non-files and native non-file leaf collisions are refused; the focused collision regressions preserve seeded core/native/catalog/profile bytes and outside targets. Resolve the conflicting destination before rerunning approved setup.
- jeopi/OMP/Pi helpers tolerate subprocess stdin `EPIPE` only after a parsed `enabled:false` response. Actual-OFF callbacks with a 1 MiB prompt return `{}` without changing prior host context, exit 0, and emit no unhandled-error/EPIPE stderr; other stdin errors remain `CONTROLLER_INPUT_ERROR`.

## Verify
- [x] Prior offline `self-test --mock`: `20/20 checks passed` (exit 0)
- [x] `python3 -m unittest scripts.test_jev_regressions` → 64 pass (exit 0)
- [x] `python3 -m unittest scripts.test_installer_regressions` → 48 pass (exit 0)
- [x] `JEV_LIVE_SMOKE=0 node --test jev/install.test.mjs jev/plugin.test.mjs jev/profile.test.mjs` → 54 total, 53 pass, 1 opt-in live skip (exit 0)
- [ ] Isolated-HOME live install from a temp checkout copy: `status` ready, `route-skills` from an empty cwd reports `fullCatalogSkills` = manifest size
- [ ] Catalog gates: validator, `generate --check`, frontmatter `--check`, `flatten --dry-run` all exit 0 (SKILL.md frontmatter is frozen; body edits only)
- [x] Live Ollama reached HTTP 200; routing returned `selectedSkill:null` / `errorCategory:backend_unavailable`. This proves transport and fail-closed output, not successful routing, model quality/calibration, or native package registration.
- Current source catalog: 367 skills, including the concurrent MI skill addition; this Jev update adds no catalog entry.

## Hosted review follow-up (2026-10-12)
- One actual `node jev/jev-harness.mjs review --backend api <task> <proposal-json>`
  invocation used isolated HOME and a Keychain credential in the child environment
  only. A disposable preloaded fetch observer allowed one POST to the official
  endpoint and disabled redirects; no profile, fallback, retry, or attestation was used.
- Observed HTTP 200, four exact Noul answer IDs, `jev-latest` -> `jev-1.13.0`,
  usage 435/80, end-to-end 340 ms, `attempted: [api]`, and `error: null`.
- Result was `proposal_only` because evidence support (0.69) and clarification
  confidence (0.58) were below 0.8. This sample does not independently prove the
  favorable-answer unvalidated-tier downgrade; no routing/pruning or calibration
  claim follows from it. Sanitized evidence omits `attemptDetails`; the observer's
  completed count of one plus `attempted: [api]` establishes the request boundary.
- Secret scan was clean. Owned observer/evidence files and empty HOME were removed;
  unrelated earlier probe artifacts with unconfirmed ownership were preserved.
- Proof: `~/vaults/llm-wiki/raw/sources/audits/2026-10-12-typesafe-live-review-a9bf469a/evidence.json`.

## Update Scaffold
- [ ] Bump `.mex/ROUTER.md` Current Project State when backend kinds, tiers, or output fields change
- [ ] Keep `context/architecture.md` "Optional Jev flow" in lockstep with the registry and tier rule
