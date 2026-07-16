# Artifact Contract

All artifacts live under `_workspace/{run-id}/` with `run-id =
{YYYYMMDD}-{cycle-label}`. Always pass absolute paths between agents.
Artifacts are never deleted — they are the studio's memory across cycles.

## Directory layout

```
_workspace/{run-id}/
├── intake/
│   └── production-brief.md          # director; bmad-gds schema
├── design/                          # game-designer
│   ├── concept.md
│   ├── worldview.md                 # G1 source of truth
│   ├── balance-sheet.md             # all numbers; data-file mirror
│   ├── core-loop.md                 # G7; numeric loop model
│   ├── novelty-scorecard.md         # G8; vs survey frequency
│   ├── presentation-spec.md         # immersion intent per scene/effect
│   └── trend-survey/                # skill://survey artifacts (.survey mirror)
├── pm/                              # game-pm
│   ├── revenue-map.md               # revenue points + touched balance numbers
│   ├── reward-bands.md              # comeback/steady/fairness numbers (G5)
│   ├── negotiation-record.md        # designer↔PM signed entries
│   └── revenue-forecast.md          # rhythm + predictability windows
├── engineering/                     # game-programmer
│   ├── architecture-contract.md
│   ├── perf-budget.md               # measured table (G6)
│   ├── movement-optimization.md     # pathing + attention-flow evidence
│   ├── resource-manifest.md
│   └── tech-verification/{name}.md  # benchmark, failure modes, fallback
├── ops/                             # game-programmer
│   ├── telemetry-contract.md
│   ├── rollback-runbook.md
│   └── release-readiness.md
├── qa/                              # game-qa
│   ├── test-plan.md
│   ├── benchmark-notes.md           # survey-derived calibration
│   ├── playtest-report.md           # per-archetype sessions
│   ├── exploit-register.md          # reproducible balance breaks
│   ├── defect-register.md           # S1–S4 lifecycle
│   ├── regression-matrix.md
│   ├── discovery-notes.md           # emergent-fun findings
│   └── gate-measurements.md         # single source for gate numbers
├── production/                      # director
│   ├── task-manifest.md
│   ├── decision-log.md
│   └── gate-reviews/{stage}-{gate}.md
├── messages/                        # numbered peer messages (fallback + audit)
├── conflicts.md
└── retrospectives/
    └── cycle-{n}-retrospective.md
```

## Key schemas

### balance-sheet.md (designer)
Markdown tables + one YAML block per system:
```yaml
system: unit-combat
win_rate_band: [0.45, 0.55]
ttk_target_s: 8
ttk_tolerance: 0.15
combo_ev_cap_vs_median: 1.3
data_mirror: <path to runtime data file>   # programmer keeps in sync
```

### reward-bands.md (PM) — G5 gate block
```yaml
comeback:
  reversal_probability_max: 0.30
  activation_cap: "1 per match"        # or cooldown/pity
  paths: [purchase, milestone]         # both must exist
steady:
  parity_sessions_band: [10, 20]
fairness:
  paid_free_winrate_delta_max_pp: 5
```

### exploit-register.md rows (QA)
`| id | severity | archetype | repro steps | measured value vs band | status | broadcast-at |`

### gate-measurements.md (QA)
One `#g{n}` section per gate: measured value, method, command/session ref,
timestamp. Director links these paths in every verdict.

### task-manifest.md rows (director)
`| task | owner | stage.phase | artifact | gate | status | beat |`

### negotiation-record.md entries (designer + PM)
```yaml
entry: {n}
revenue_point: <name>
balance_number: <sheet ref>
designer_bound: <value + rationale>
pm_bound: <value + rationale>
agreed: <value>            # or "escalated"
signed: [game-designer, game-pm]
```

## Conventions
- YAML blocks carry every gate-checkable number; prose explains, never replaces.
- Peer messages are numbered `messages/{seq}-{from}.md` when SendMessage is
  unavailable; broadcast messages state `feedback-requested-by: <date>`.
- Survey outputs follow the skill://survey contract (`triage.md`,
  `context.md`, `solutions.md`) mirrored under `design/trend-survey/` or
  referenced from `.survey/{slug}/`.
- Every measured claim carries the command or session that produced it.
