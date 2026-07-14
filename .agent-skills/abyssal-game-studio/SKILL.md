---
name: abyssal-game-studio
description: Run an engine-agnostic, evidence-gated game-production harness for a vertical slice, feature, economy change, or release: BMAD-GDS production, survey-grounded trend research, fair monetization, deterministic systems engineering, adversarial QA, and live-ops readiness. Use for a game production workflow spanning research through release gates; do not use for isolated engine bugs, a single asset, or a narrow playtest-summary task.
allowed-tools: Read Write Edit Glob Grep Bash Task
metadata:
  version: "1.0.0"
  tags: game-production, bmad-gds, survey, monetization, deterministic-systems, adversarial-qa, live-ops
  platforms: jeopi, jeo, Codex, Antigravity, GJC, Claude Code
---

# Abyssal Game Studio

An engine-agnostic, file-backed production harness. It governs a game vertical slice, system, economy, or release change without choosing an engine, renderer, package, or runtime API. The common skill is the portability surface; read `references/runtime-adapters.md` before selecting a collaboration mode.

`references/role-contracts.json` and `references/workflow-contract.json` are the typed source of truth. Their enum IDs and booleans override this guide if wording differs. Read these files, `references/artifact-contract.md`, and `references/quality-gates.md` before creating a run.

## When to use this skill

Use when the request needs coordinated game production across research, player experience, monetization, quantitative systems, implementation contracts, QA, and operations. Route an isolated build failure, profiler capture, asset task, or feedback-only triage to its narrower skill instead.

Required routed inputs:

- **`bmad-gds`**: P0 producer workflow, one next production artifact at a time.
- **`survey`**: P1 evidence packet; it creates or validates the preserved `<repo-root>/.survey/<slug>/` source package.
- **`pm`**: P2 player segments, direct-price catalog, fairness policy, and trust metrics.
- **`qa`**: P4 independent verification discipline; this harness adds its mandatory adversarial 20-loop contract.

## Run setup and invariants

1. Allocate a unique `<run-id>` and create only `<repo-root>/.harness/abyssal-game-studio/<run-id>/` for run artifacts. Never overwrite a prior run or use shared temporary outputs.
2. Give every artifact a `run_id`, owner, creation time, input artifact versions/hashes, status, and decision IDs. Valid statuses are `draft`, `evidence-ready`, `blocked`, `PASS`, `FAIL`, `INCONCLUSIVE`, `ready`, and `STOP-SHIP`.
3. Treat an artifact as immutable when published. A correction creates a new version (for example `rule-contract-v2.md`) and an append-only decision-log entry that links old and new versions. Do not edit history or delete defect evidence.
4. Use the eight profiles in `templates/agents/`. The production director is the sole coordinator; specialists report decisions and blockers to that role. Peer exchange is evidence paths, questions, and conflicts only—not direction, approval, or a gate result.
5. Stop immediately on ownership overlap, missing input hashes, inconsistent version references, or a hard-gate failure. Record the blocker and return only the owning role to its permitted scope.

## Role boundary

| Role | Sole authority | Never owns |
|---|---|---|
| Production director | BMAD-GDS sequence, milestones, decision/ownership/re-entry logs | game design, code, QA edits, commercial policy, veto override |
| Trend researcher | survey evidence, provenance, comparables, confidence | feature, price, or release commitment |
| Experience/narrative director | world, interaction, readability, accessibility | economy values, code, prices, QA verdict |
| Monetization PM | segments, value, direct prices, fairness policy, metrics | combat balance or QA verdict |
| Systems/economy designer | rules, balance, p50/p90, source/sink, counterplay, simulation | implementation or prices |
| Engineering lead | deterministic replay, performance/memory/input/pathing contracts | rule values, commercial policy, QA severity/verdict |
| Adversarial QA lead | 20 iterations, severity, regressions, PASS/FAIL | fixes, waivers, schedules, gate relaxation |
| Live-operations lead | telemetry, release readiness, rollback, feedback intake | QA override or unverified rollback approval |

## Instructions

### P0 — BMAD-GDS intake

The director consumes only raw intake and constraints. Use `bmad-gds` to publish, in order: `production-brief`, `task-manifest`, `research-question`, `player-fantasy`, `product-constraints`, `systems-goals`, and `technical-constraints`. Engine selection may remain `unknown`. No later phase starts until the production brief and task manifest are immutable.

### P1 — parallel evidence and experience

Run only the survey and experience roles concurrently when the runtime permits; otherwise run them file-backed in either order. The researcher must use `survey`, retain the source package under `<repo-root>/.survey/<slug>/`, and publish at least six comparable games with URL/publisher/retrieval date/evidence grade/confidence/applicability limit. The experience director creates a world bible, interaction map, and readability/accessibility specification from player fantasy without inventing system values. Unsourced trend claims or fewer than six comparables block P2.

### P2 — evidence-based product and systems design

After an `evidence-ready` survey, the PM must use `pm` to publish segments/JTBD, a direct value-price catalog, immutable monetization policy, and metrics contract. Every sale must state direct price, contents, functional impact, region/tax/refund disclosure, and fairness result before purchase.

The policy **must reject** P2W, paid random rewards, deceptive or unclear direct pricing, hidden odds/acquisition conditions, and loss-targeted or loss-induced offers. No exception is available.

Only after that policy is immutable may the systems role publish rule, economy, balance, and simulator contracts. Every value has unit, formula, input range, source/sink, p50/p90 result, counterplay ID, and reproducible simulation procedure. Unlimited growth is not unlimited victory: it needs explicit cost, exposure, diminishing return or accessible counterplay. Missing deterministic simulation, p90 runaway, inflation/accumulation risk, or counterplay evidence blocks P3. The experience director then binds immutable rule IDs to narrative, visual/audio, alternate accessibility signals, and verification scenes.

### P3 — engine-neutral engineering contract

The engineering lead consumes immutable rules and interactions. Publish architecture, deterministic replay, performance evidence, and risky-technology validation. Require same input, seed, and version to produce the same result and traceable state transitions. Measure before optimizing and record workload, environment, budget, result, and replay procedure for frame time, allocations/memory, input latency, pathing, and peak combat. Keep engine-specific APIs behind future adapters; never change rule values for implementation convenience. Non-determinism, input loss, pathing deadlock, memory-budget breach, or unvalidated risky technology blocks P4.

### P4 — adversarial QA

The QA lead must use `qa` practice and independently execute all 20 rows in `quality-gates.md`, covering A1–A7 player archetypes. Each iteration records archetype, attack family, seed/input, expected and actual result, evidence path, severity, reproducibility, and PASS/FAIL. Missing or non-reproducible evidence is `INCONCLUSIVE`, which is release-equivalent to `FAIL`.

QA must explicitly test deterministic replay, command flooding, pathing, learning recovery, p50/p90 and economic loops, unlimited-growth exploits and counterplay, every monetization prohibition, VFX/animation readability, sensory and input accessibility, narrative-rule consistency, peak performance/memory, telemetry integrity, and rollback/veto behavior. QA cannot fix defects, waive them, alter schedules, or relax gates.

### P5 — live-operations readiness

The operations lead consumes QA verdict, metrics contract, and performance evidence. It must first publish and verify telemetry and rollback contracts, then publish feedback intake and release readiness. Telemetry is minimum-necessary, purpose-limited, and privacy-aware; metrics are reported by segment/version/release cohort rather than asserted as causes. Rollback must name trigger, owner, timing, data preservation, and procedures for corruption, economy exploitation, fairness collapse, and Critical defects.

`ready` requires QA `PASS`, verified rollback, observable core fairness/economy/experience/performance signals, and no operational stop-ship condition. QA `FAIL` or `INCONCLUSIVE`, missing telemetry, or unverified rollback is `STOP-SHIP`.

## Quality gates and vetoes

All following are hard gates: survey provenance with six comparables; full research→product/systems→rule→engineering→QA→operations traceability; accessible counterplay for every core strength; p50/p90 and source/sink/inflation evidence; the fair-monetization prohibitions above; all 20 QA rows plus change-impact regressions; narrative/VFX readability and accessibility proof; performance/memory/movement-path evidence; QA PASS and operations ready.

The QA lead’s `FAIL` and operations lead’s `STOP-SHIP` are independent vetoes. No director, PM, engineer, or other role may override, clear, or bypass either veto. A release without QA and operations readiness is invalid.

## Re-entry

Re-entry opens only after a QA verdict, for at most two cycles:

1. QA submits defect ID, evidence, and impact scope.
2. Director fixes one owner and one bounded corrective scope in immutable `reentry-order`.
3. The owner creates a new immutable artifact version and updates traceability.
4. QA reruns affected attacks plus the required regression matrix.
5. Operations reassesses readiness.

After the second cycle, a remaining `FAIL` or `STOP-SHIP` closes the milestone. Start a new run at P0; do not retry the same input a third time, erase evidence, or use re-entry as a veto override.

## Completion record

Only call a run complete when `<repo-root>/.harness/abyssal-game-studio/<run-id>/qa/qa-verdict.md` is `PASS` and `<repo-root>/.harness/abyssal-game-studio/<run-id>/ops/release-readiness.md` is `ready`. Every other state is blocked, failed, or incomplete.

## Examples

- “Run a vertical-slice production plan for our dark-fantasy strategy game, from comparables research through rollback readiness.”
- “Validate our unlimited-growth economy, direct-price catalog, deterministic replay, and twenty adversarial QA iterations before release.”

## Best practices

- Preserve the typed JSON contracts as the governing source; do not rewrite prohibited ownership or veto behavior in a run artifact.
- Prefer the file-backed sequential fallback whenever native collaboration is unavailable; it preserves every gate and audit trail.
- Treat missing provenance, simulator reproduction, QA evidence, or rollback proof as blocking evidence—not a reason to infer success.

## References

- `references/role-contracts.json`
- `references/workflow-contract.json`
- `references/artifact-contract.md`
- `references/quality-gates.md`
- `references/runtime-adapters.md`
- `evals/trigger-cases.json`
