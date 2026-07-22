# Stage Cycle Detail

One cycle = Stage 1 → Stage 2 → Stage 3 → retrospective → next-cycle entry
decision. The harness is a standing structure: cycles repeat, and the
retrospective decides whether the next cycle re-enters at Stage 1 (concept
shift) or Stage 2 (retune/develop).

Task rows: `owner → artifact (gate)`. ∥ marks parallel groups; → marks hard
dependency. All paths relative to `_workspace/{run-id}/`.

## Stage 1 — Concept, presentation, animation, resources, core build
Goal: lock the concept and presentation direction; get the core loop playable
with first-pass animation/resources.

Phase 1a (parallel):
- game-designer → `design/trend-survey/` via skill://survey (genre trends: composition, controls, rules; UX-centered)
- game-qa → `qa/benchmark-notes.md` via skill://survey (similar games as calibration benchmarks; ≥5 titles) + `qa/test-plan.md` + archetype set
- game-pm → `pm/revenue-map.md` draft (candidate revenue points, unpriced)

Phase 1b (after designer survey):
- game-designer → `design/concept.md`, `design/worldview.md`, `design/balance-sheet.md` v1 (numeric skeleton), `design/core-loop.md` candidate (G7 input), `design/novelty-scorecard.md` v1 (G8 candidate vs survey frequency), `design/presentation-spec.md`

Phase 1c (negotiation round 1):
- game-designer ↔ game-pm → `pm/negotiation-record.md` entries for every revenue point touching a balance number; PM sets draft reward bands in `pm/reward-bands.md`

Phase 1d (build):
- game-programmer → core loop implementation + presentation/animation first pass per `design/presentation-spec.md` + resource manifest (`engineering/resource-manifest.md`) + `engineering/architecture-contract.md` + `ops/telemetry-contract.md` draft
- game-qa (shadow) → smoke tests on each build drop; early defects filed

Gate review (director): G7 draft, G1 draft, G6-ops draft → PASS moves to
Stage 2; FIX loops within Stage 1 (≤2); REDO returns to Phase 1b.

## Stage 2 — Balance, core-loop stability, novelty development
Goal: numbers hold under adversarial play; novelty element proven.

Phase 2a:
- game-qa → archetype-rotation exploit hunt (≥5 types) → `qa/exploit-register.md` + `qa/playtest-report.md`; every finding broadcast to ALL agents with feedback request

Phase 2b (after QA findings):
- game-designer → balance-sheet retune (win-rate/TTK/combo-EV back into bands); novelty element developed to full spec
- game-pm → reward-band adjustment: comeback (일발역전) probability/cap, steady-player (꾸준 보상) parity band, fairness cap; `pm/revenue-forecast.md` v1

Phase 2c (negotiation round 2):
- game-designer ↔ game-pm → negotiation-record update; unresolved after one exchange → director arbitration (numeric evidence only)

Phase 2d:
- game-programmer → apply data-driven changes (no code edits for numbers), implement novelty element, respond to every defect (`fixed`/`deferred`+reason)
- game-qa → re-verification sims: bands, comeback conversion, paid/free delta, loop repeat-rate

Gate review: G2, G3, G5, G7 final, G8 → PASS moves to Stage 3; REDO returns
to Phase 2b with the failed measurement attached.

## Stage 3 — Ops stability and play impact (연출·시나리오·이펙트)
Goal: runs stably in operation; every remaining minute of play impact
harvested.

Phase 3a (parallel):
- game-programmer → perf optimization to budget (p95 frame, memory soak, input latency), movement-path optimization (`engineering/movement-optimization.md`), ops hardening (`ops/rollback-runbook.md` tested, `ops/release-readiness.md`)
- game-designer + game-programmer → impact pass: scenario beats, effect timing, hit feedback, transitions per presentation-spec; before/after evidence per improvement
- game-pm → `pm/revenue-forecast.md` final: revenue rhythm across planned concept rotations, predictability windows + confirming telemetry fields

Phase 3b:
- game-qa → full regression (`qa/regression-matrix.md`) + immersion scoring per scene (G4) + G1 final audit + G6 verification of programmer measurements

Gate review: G4, G6 final, G1 final.

## Cycle close
- game-production-director → `retrospectives/cycle-{n}-retrospective.md`:
  gate table with measured values, unresolved risks, next-cycle entry
  decision (Stage 1 concept shift | Stage 2 retune), and the next public beat.
- Archive nothing away: `_workspace/{run-id}/` stays intact as studio memory.

## Re-entry rules
- Resuming mid-cycle: read newest `production/task-manifest.md`; enter at the
  first phase with incomplete tasks.
- Emergency re-entry (e.g., live exploit): enter at Phase 2a with the
  exploit register pre-seeded; gates for untouched areas carry forward.
