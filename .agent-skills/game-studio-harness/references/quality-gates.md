# Quality Gates G1–G8

Every gate verdict requires: measured value + measurement method + evidence
path. A claim without all three is FAIL. Verdicts: PASS / FIX (specific
issues, ≤2 revision loops) / REDO (restart previous stage).

QA owns measurement (`qa/gate-measurements.md`); the director owns the
verdict (`production/gate-reviews/{stage}-{gate}.md`).

## Gate table

| ID | Gate (user condition) | Threshold | Measured by | Evidence |
|---|---|---|---|---|
| G1 | Narrative consistency within the worldview (세계관 내 일관적 서사) | 0 un-waived lore violations; 100% of shipped strings/effects/scenarios trace to `design/worldview.md` | QA audit pass over all player-visible content | `qa/gate-measurements.md#g1`, violation list |
| G2 | Rules & balance numbers well-set (규칙·밸런스 수치) | 100% mechanics covered in `design/balance-sheet.md`; matchup win-rates within 45–55%; TTK within ±15% of target; combo-matrix EV bounded (no dominant pair >1.3× median EV) | QA simulation/scripted matchups + sheet audit | `qa/gate-measurements.md#g2`, sim logs |
| G3 | Player-type diversity sufficient (플레이어 타입 다양성) | ≥3 archetypes independently viable (win-rate within band using distinct strategies); no archetype >50% dominance in optimal play; ≥5 archetypes tested | QA archetype-rotation sessions | `qa/playtest-report.md`, per-archetype table |
| G4 | Effects & animations give immersion (이펙트·애니메이션 몰입감) | Median immersion score ≥4.0/5 across scored scenes; effect feedback latency ≤100ms spot-checks; 0 unresolved readability complaints (S1/S2) | QA structured playtest scoring + latency probes | `qa/gate-measurements.md#g4` |
| G5 | Revenue–balance synergy projected (매출·밸런스 시너지) | Paid/free win-rate delta ≤5%p at equal skill; comeback (일발역전) instant-reversal probability ≤30% per activation with recorded cap/cooldown; free-path parity within stated 10–20 session band; every revenue point has a signed negotiation-record entry | QA fairness sims + PM/designer record audit | `pm/reward-bands.md`, `pm/negotiation-record.md`, `qa/gate-measurements.md#g5` |
| G6 | Game-ops plan appropriately applied (게임운영 계획) | `ops/telemetry-contract.md` implemented (all PM-forecast + QA-verification fields emitting); `ops/rollback-runbook.md` tested once; `ops/release-readiness.md` checklist 100%; perf budget table green (p95 frame ≤16.7ms, long-frame <0.5%, memory stable over 30-min soak, input ≤100ms) | Programmer measurements verified by QA | `engineering/perf-budget.md`, `ops/*` |
| G7 | Core loop discovered, ≥1 mandatory (코어루프 최소 1개) | ≥1 loop in `design/core-loop.md` with numeric model: period 30–180s, ≥3 actions/loop, ≥1 reward event/loop, and playtest repeat-rate proxy ≥70% (testers voluntarily re-enter the loop) | Designer model + QA playtest confirmation | `design/core-loop.md`, `qa/playtest-report.md` |
| G8 | Novelty/striking element, ≥1 mandatory (참신성·인상 요소 1개) | ≥1 element appearing in ≤2 of ≥5 surveyed comparable titles (survey frequency table) AND QA impression score ≥4/5 | Designer novelty scorecard vs survey data + QA scoring | `design/novelty-scorecard.md`, `design/trend-survey/`, `qa/gate-measurements.md#g8` |

## Stage → gate mapping

| Stage | Gates required to exit |
|---|---|
| Stage 1 | G7 draft (loop modeled + implemented), G1 draft (worldview locked, content-so-far consistent), G6-ops draft (telemetry contract + resource manifest exist) |
| Stage 2 | G2, G3, G5, G7 final, G8 |
| Stage 3 | G4, G6 final, G1 final |

## Blocking rules
- Any open S1 defect blocks every gate.
- Missing evidence path = FAIL regardless of claimed value.
- A gate FIX loop may run at most twice; the third failure forces a director
  scope decision recorded in `production/decision-log.md`.
- Waivers (e.g., intentional lore break for an event) must be written by the
  director with reasoning and expiry; unexpired waivers count as pass-with-note.

## Threshold provenance
Bands (45–55% win-rate, ±15% TTK, ≤30% reversal, ≤5%p paid delta, 10–20
session parity, 16.7ms/100ms perf, 4.0/5 immersion, ≤2-of-5 novelty
frequency, ≥70% loop repeat-rate) are the harness defaults. The designer may
propose per-genre overrides in `design/balance-sheet.md#band-overrides`;
overrides take effect only after a director-approved decision-log entry.
