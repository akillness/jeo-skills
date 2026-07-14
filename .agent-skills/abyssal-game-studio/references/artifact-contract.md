# Abyssal Game Studio artifact contract

`role-contracts.json` and `workflow-contract.json` are the governing typed source of truth. Their stable enum IDs and typed booleans override this readable contract.

## Immutable run rules

- Every run root is `<repo-root>/.harness/abyssal-game-studio/<run-id>/`; a run ID is unique and never reused.
- Published artifacts are immutable. Corrections create `-v2` (or later) and link prior versions through an append-only decision log.
- Each artifact has `run_id`, `owner`, `created_at`, `input_artifacts`, `input_hashes`, `status`, and `decision_ids` in YAML metadata or its first table.
- Only `draft`, `evidence-ready`, `blocked`, `PASS`, `FAIL`, `INCONCLUSIVE`, `ready`, and `STOP-SHIP` are valid statuses.
- Preserve external research source material at `<repo-root>/.survey/<slug>/`; run artifacts contain its absolute reference and verification time.

## Required outputs

| Owner | Paths under `<repo-root>/.harness/abyssal-game-studio/<run-id>/` | Minimum contract |
|---|---|---|
| Director | `intake/{production-brief,research-question,player-fantasy,product-constraints,systems-goals,technical-constraints}.md`; `production/{task-manifest,milestone-brief,decision-log,ownership-register,reentry-order}.md` | scope, owner, gate, rollback condition; append-only decision and ownership records |
| Trend researcher | `research/{survey-decision-packet,comparables-table,claim-traceability}.md` | 6+ comparables; URL/publisher/retrieval date/evidence grade/confidence/applicability limit |
| Experience/narrative | `experience/{world-bible,interaction-map,readability-accessibility-spec,narrative-rule-traceability}.md` | rule ID, inputs, visual/audio signals, equivalent accessibility signal, verification scene |
| Monetization PM | `product/{segments-jtbd,value-pricing-catalog,monetization-policy,metrics-contract}.md` | direct price, contents, functional impact, disclosure, trust/fairness result |
| Systems/economy | `systems/{rule-contract,economy-ledger,balance-model,simulator-evidence}.md` | unit/formula/range, source/sink, p50/p90, counterplay, reproducible simulation |
| Engineering | `engineering/{architecture-contract,determinism-replay-contract,performance-evidence,risky-tech-validation}.md` | engine-neutral boundary, seed, dataset/workload, measurement environment/budget/result, reproduction procedure |
| QA | `qa/{iteration-01..20,defect-register,regression-matrix,qa-verdict}.md` | archetype, attack, expected/actual, evidence, severity, reproducibility, PASS/FAIL |
| Live operations | `ops/{telemetry-contract,release-readiness,rollback-runbook,feedback-intake}.md` | consumes QA/metrics/performance; verifies telemetry and rollback before `ready` or `STOP-SHIP` |

## Traceability and conflict handling

1. Trace `research claim ID → product/systems decision ID → rule ID → engineering contract ID → QA iteration ID → operations metric ID` bidirectionally.
2. Every sale links its PM policy ID and QA fairness attack ID. Every unlimited-growth value links cost, exposure, counterplay, p50/p90 simulation rows.
3. Every defect correction links defect ID, replacement artifact version, and rerun QA IDs. Never remove the original defect or evidence.
4. Store messages at `messages/<sequence>-<sender>.md` as `run-id | phase | sender -> recipient | type | artifact | blocking`.
5. Record ownership overlap or conflicting contracts in `production/ownership-conflict.md`. Work stops until only the director appends a resolution to the ownership register; no role edits another role's artifact.
