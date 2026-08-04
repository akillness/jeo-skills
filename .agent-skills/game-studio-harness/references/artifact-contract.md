# Artifact Contract

A studio is a standing structure, so the workspace has exactly one live folder
and one archive. Cycle *n+1* does not create a sibling directory — it updates
`current/` in place and records the transition in
`current/production/task-manifest.md`. Always pass absolute paths between
agents. Artifacts are never deleted — they are the studio's memory across
cycles.

`run-id` (`{YYYYMMDD}-{cycle-label}`) still exists, but it is a *value carried
inside the documents*, not a directory name. It becomes a directory name only
once, at archive time.

## Directory layout

```
_workspace/
├── current/                         # the single live folder — write here
│   ├── intake/
│   │   └── production-brief.md      # director; bmad-gds schema
│   ├── design/                      # game-designer
│   │   ├── concept.md
│   │   ├── worldview.md             # G1 source of truth
│   │   ├── balance-sheet.md         # all numbers; data-file mirror
│   │   ├── core-loop.md             # G7; numeric loop model
│   │   ├── novelty-scorecard.md     # G8; vs survey frequency
│   │   ├── presentation-spec.md     # immersion intent per scene/effect
│   │   └── trend-survey/            # skill://survey artifacts (.survey mirror)
│   ├── pm/                          # game-pm
│   │   ├── revenue-map.md           # revenue points + touched balance numbers
│   │   ├── reward-bands.md          # comeback/steady/fairness numbers (G5)
│   │   ├── negotiation-record.md    # designer↔PM signed entries
│   │   └── revenue-forecast.md      # rhythm + predictability windows
│   ├── engineering/                 # game-programmer
│   │   ├── architecture-contract.md
│   │   ├── perf-budget.md           # measured table (G6)
│   │   ├── movement-optimization.md # pathing + attention-flow evidence
│   │   ├── resource-manifest.md
│   │   └── tech-verification/{name}.md
│   ├── ops/                         # game-programmer
│   │   ├── telemetry-contract.md
│   │   ├── rollback-runbook.md
│   │   └── release-readiness.md
│   ├── ui/                          # UI spec and evidence, when the run has one
│   ├── qa/                          # game-qa
│   │   ├── test-plan.md
│   │   ├── benchmark-notes.md       # survey-derived calibration
│   │   ├── playtest-report.md       # per-archetype sessions
│   │   ├── exploit-register.md      # reproducible balance breaks
│   │   ├── defect-register.md       # S1–S4 lifecycle
│   │   ├── regression-matrix.md
│   │   ├── discovery-notes.md       # emergent-fun findings
│   │   └── gate-measurements.md     # single source for gate numbers
│   ├── production/                  # director
│   │   ├── task-manifest.md
│   │   ├── decision-log.md
│   │   └── gate-reviews/{stage}-{gate}.md
│   ├── messages/                    # numbered peer messages (fallback + audit)
│   ├── conflicts.md
│   └── retrospectives/
│       └── cycle-{n}-retrospective.md
├── archive/{run-id}/                # frozen prior cycles — READ-ONLY
└── editor/                          # tooling, NOT an artifact lane
```

## The three top-level folders are not peers

| Folder | Written by | Archived | Holds evidence |
|---|---|---|---|
| `current/` | every agent, every cycle | at cycle close | yes |
| `archive/{run-id}/` | nobody — `git mv` only | it *is* the archive | yes, read-only |
| `editor/` | tool maintenance only | never | no |

**`current/`** is the only folder an agent writes artifacts to.

**`archive/{run-id}/`** is immutable history. Read it for evidence; never edit
or delete it. Archiving is the only way material leaves `current/`: at cycle
close, `git mv` the superseded lane material into
`_workspace/archive/{run-id}/` and write
`current/retrospectives/cycle-{n}-retrospective.md`. Never delete a
`_workspace/` artifact to make a gate or a summary look cleaner.

**`editor/`** is the local artifact editor, if the studio has one — durable
tooling that reads and writes the lanes above. It carries no `run-id`, is
never archived, and never holds evidence; a path under `editor/` is never a
valid citation for a gate measurement. Anything it generates for its own
operation (pre-overwrite backups, atomic-write temp files) is gitignored by
its own `.gitignore`, not by the repository root.

An editor that touches studio artifacts inherits three constraints from this
contract:

- **Concurrent-write detection.** Multiple worktrees and agents write these
  lanes at once. Every save carries the mtime the client last read, and a
  mismatch is refused (409) rather than merged or clobbered. Do not add a
  tolerance window: the one case it would wave through is two writers landing
  in the same second, which is exactly the case worth catching.
- **No delete route.** Artifacts are never deleted. Overwrite-with-backup and
  rename are the only removals the tool may offer.
- **Scope refusal.** Writes that escape `_workspace/`, or that target the
  editor's own files, are refused (403).

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
