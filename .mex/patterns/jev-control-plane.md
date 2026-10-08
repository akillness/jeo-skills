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
edges:
  - target: "context/architecture.md"
    condition: "for where the optional Jev flow sits next to catalog distribution"
  - target: "patterns/catalog-metadata-changes.md"
    condition: "when editing skills.json model_policies (manifest is the single source of truth)"
  - target: "patterns/jeo-skill-install-flow.md"
    condition: "when Jev setup interacts with the catalog installer"
grounds_to: []
last_updated: 2026-10-08
---

# Jev Control Plane Runbook

Source of truth is `jev/` in this repo: `jev-harness.mjs` (Node ESM, built-ins only), `jev-setup.sh`, `jev_local_server.py`, `jev-control-plane.rule.md`, `README.md`; portable skill `.agent-skills/jev-control-plane/SKILL.md`. Design record: `.survey/jev-model-routing/` (gitignored research + `design-options.md`, interview-approved 2026-10-08).

**Installed copy vs repo.** `jev-setup.sh` copies `jev/` into `~/.agents/jev/`. On 2026-10-01 fixes were applied directly to the *installed* copy and never ported, so the two diverged (sha1 `f835f55…` installed vs repo). The repo rewrite of 2026-10-08 supersedes it; resync with `bash jev/jev-setup.sh --mode <kind>` (home-scoped, user-approved). Never edit `~/.agents/jev/` by hand again.

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
- **Advisory host routing** (`routing` field): `skills.json` top-level `model_policies` (`default` or skill-name keys → `{candidates:[{provider, model}], fallback, constraints}`), Jev Choice over `provider/model` + `other`, output `{skill, policy, candidates[rank, probability], chosen, confidence, provenance:{backend:{kind, driver, model, tier}}}`. No host adapter consumes it yet. Not projected into TOON/README; `validate_manifest` checks the shape.
- **Status**: per-operation chains with `usable`; exit 3 only when a chain has no usable backend; `--operation <op>`; probe timeouts are `state:"warming"`, refused/5xx `unavailable`, malformed discovery JSON `unavailable`. Compatibility fields `mode`/`endpoint` retained.

## Commands
```sh
node jev/jev-harness.mjs self-test --mock                     # 20/20 offline contract checks
node --test jev/profile.test.mjs                               # 3 isolated-HOME setup tests
python3 scripts/test_jev_regressions.py                        # 52 loopback regressions (documented wire shapes)
node jev/jev-harness.mjs status [--operation review]           # exit 0/2/3
node jev/jev-harness.mjs route-skills [--backend K] [--model M] [--top-k N] "<task>"
node jev/jev-harness.mjs prune-context < blocks.jsonl
node jev/jev-harness.mjs review "<task>" '<proposal-json>'
node jev/jev-harness.mjs smoke [--backend K] [--task "<text>"]  # live, never authorizes
```

## Gotchas
- Capture test logs with the runner's exit preserved (`set -o pipefail; cmd > log; echo $?`), then grep the log. Piping into `grep`/`tail` reports the filter's exit, not the runner's.
- The regression fixture must speak the **documented** shapes (422 without `model`; Choice `criteria`; `noul` answers). A fixture that mirrors the harness's assumptions hides wire mismatches — that is how the `api` path stayed broken for weeks.
- `/v1/decide` state is sent as the raw object (the server `json.dumps` dicts itself). `thinking` must be `"off"`; a response with `thinking.used: true` is rejected.
- Live Ollama is slow and serial: aborted client requests keep generating server-side, so a stuck first call queues everything after it. Run `smoke` with nothing else hitting Ollama; a cold model load is ~9 s, a warm Noul ~0.5 s, a full route on the 9B Q4 chat path ~3 min.
- Legacy `~/.agents/jev/.env` shares `JEV_LOCAL_MODEL` between `local` and the generative kinds; the harness only honors it for `local` when the file is local-scoped.
- Two legacy tests (`empty/partial saved config ⇒ exit 3`, `ambient JEV_MODE switch cannot deactivate a saved opt-in`) were already failing at HEAD before this work; the rewrite satisfies them instead of weakening them.
- HF model-card reads: use `read(...:raw)` for source files (`vl/serve_decide.py`); a non-raw child URL returns the card.
- Residual (unvalidated generative tier only): the Q4 chat path still answers polarity-negative review questions "yes/0.95" (same as the 2026-10-02 audit). Safe by construction (`permit` impossible on that tier) but the `proposal_only` reasons are noisy. The 2026-10-01 installed-copy "ask positively and invert" workaround was deliberately not ported — calibration work belongs with a validated head.
- `route-skills` needs a catalog. Order: `JEV_CATALOG_PATH` → the cwd checkout → the setup-installed snapshot `~/.agents/jev/skills.json` → a legacy `~/.agents/jeo-skills-repo` clone (last: the 2026-10-01 clone is stale, 352 skills, no `model_policies`). Before 2026-10-08 setup installed no catalog, so the installed harness only routed from inside a checkout. Verify "standalone" from an empty cwd with `JEV_CATALOG_PATH` unset — a run from the repo hides this.
- Excerpts are sent to the backend: `skillExcerpt` checks containment on `realpath` (catalog `../` paths and in-root symlinks to outside files are both refused). The user's `~/.agents/skills` has ~93 symlinked dirs (other sources) that resolve outside the root; none are catalog skills, so no excerpt is lost.
- An isolated-HOME live install must not symlink the real `~/.agents/skills`: setup then finds the real `jeo-skill` router and runs `npx skills add --agent <profile>` (network; fails for a non-agent profile id). Copy SKILL.md files instead.

## Verify
- [ ] `self-test --mock` prints `20/20 checks passed` (exit 0)
- [ ] `python3 scripts/test_jev_regressions.py` → `Ran 52 tests … OK` (exit 0)
- [ ] `node --test jev/profile.test.mjs` → 3 pass
- [ ] Isolated-HOME live install from a temp checkout copy: `status` ready, `route-skills` from an empty cwd reports `fullCatalogSkills` = manifest size
- [ ] Catalog gates: validator, `generate --check`, frontmatter `--check`, `flatten --dry-run` all exit 0 (SKILL.md frontmatter is frozen; body edits only)
- [ ] `smoke` against the only live backend here (Ollama JEV-9B-GGUF) completes with tier `unvalidated` and review `proposal_only`

## Update Scaffold
- [ ] Bump `.mex/ROUTER.md` Current Project State when backend kinds, tiers, or output fields change
- [ ] Keep `context/architecture.md` "Optional Jev flow" in lockstep with the registry and tier rule
