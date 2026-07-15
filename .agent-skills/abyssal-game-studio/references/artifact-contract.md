# Abyssal Game Studio artifact contract

`role-contracts.json` and `workflow-contract.json` are the governing typed source of truth. Their stable enum IDs and typed booleans override this readable contract.

## Immutable run rules

- Every run root is `<repo-root>/.harness/abyssal-game-studio/<run-id>/`; a run ID is unique and never reused.
- Published artifacts are immutable. Corrections create `-v2` (or later) and link prior versions through an append-only decision log.
- Each artifact has `run_id`, `owner`, `created_at`, `input_artifacts`, `input_hashes`, `status`, and `decision_ids` in YAML metadata or its first table.
- Only `draft`, `evidence-ready`, `blocked`, `PASS`, `FAIL`, `INCONCLUSIVE`, `ready`, `STOP-SHIP`, and `MILESTONE_CLOSED` are valid statuses. Immutability is a separate published-artifact predicate, never a status.
- Preserve external research source material at `<repo-root>/.survey/<slug>/`; run artifacts contain its absolute reference and verification time.

## Required outputs

| Owner | Paths under `<repo-root>/.harness/abyssal-game-studio/<run-id>/` | Minimum contract |
|---|---|---|
| Director | `intake/{production-brief,research-question,player-fantasy,product-constraints,systems-goals,technical-constraints}.md`; `production/{task-manifest,milestone-brief,decision-log,ownership-register,reentry-order,milestone-closure}.md` | scope, owner, gate, rollback condition; monotonic re-entry count; append-only decision and ownership records |
| Trend researcher | `research/{survey-decision-packet,comparables-table,claim-traceability}.md` | 6+ comparables; URL/publisher/retrieval date/evidence grade/confidence/applicability limit |
| Experience/narrative | `experience/{world-bible,interaction-map,readability-accessibility-spec,narrative-rule-traceability}.md` | rule ID, inputs, visual/audio signals, equivalent accessibility signal, verification scene |
| Monetization PM | `product/{segments-jtbd,value-pricing-catalog,monetization-policy,metrics-contract}.md` | direct price, contents, functional impact, disclosure, trust/fairness result |
| Systems/economy | `systems/{rule-contract,economy-ledger,balance-model,simulator-evidence}.md` | unit/formula/range, source/sink, p50/p90, counterplay, reproducible simulation |
| Engineering | `engineering/{architecture-contract,determinism-replay-contract,performance-evidence,risky-tech-validation}.md` | engine-neutral boundary, seed, dataset/workload, measurement environment/budget/result, reproduction procedure |
| QA | `qa/{iteration-01..20,defect-register,regression-matrix,qa-verdict}.md` | archetype, attack, seed/input, expected/actual, evidence path, severity, reproducibility, finite watchdog/budget, observed consumption, terminal outcome, PASS/FAIL |
| Live operations | `ops/{operations-draft,telemetry-contract,release-readiness,rollback-runbook,feedback-intake}.md` | P3 immutable draft enables P4 telemetry/rollback attacks; P5 consumes QA PASS and finalizes `ready` or `STOP-SHIP` |

## Traceability and conflict handling

1. Trace `research claim ID → product/systems decision ID → rule ID → engineering contract ID → QA iteration ID → operations metric ID` bidirectionally.
2. Every sale links its PM policy ID and QA fairness attack ID. Every unlimited-growth value links cost, exposure, counterplay, p50/p90 simulation rows.
3. Every QA or operations veto correction links its evidence ID, replacement artifact version, affected rerun QA IDs, and the monotonic re-entry cycle. On exhaustion, publish `production/milestone-closure.md` as `MILESTONE_CLOSED`; never create a successor run automatically.
4. Store messages at `messages/<sequence>-<sender>.md` as `run-id | phase | sender -> recipient | type | artifact | blocking`.
5. Record ownership overlap or conflicting contracts in `production/ownership-conflict.md`. Work stops until only the director appends a resolution to the ownership register; no role edits another role's artifact.
