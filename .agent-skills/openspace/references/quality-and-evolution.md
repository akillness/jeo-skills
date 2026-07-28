# Quality and Evolution

OpenSpace's second and third jobs: judge whether a skill can be trusted, and let it
change only under evidence and control.

## Quality signals (Skill Quality Layer)

The quality layer answers: *which skills can the agent trust?*

- **Skill outcomes** — records whether a skill was selected, applied, completed the
  task, or fell back to something else.
- **Tool reliability** — tracks tool failures and slowdowns that can make a skill
  unreliable even if its `SKILL.md` reads well.
- **Task-result as evidence** — uses real task behavior instead of trusting skill
  descriptions alone.

Result: a skill folder becomes easier to trust because OpenSpace knows what actually
worked across real runs, not just what the frontmatter claims.

## Controlled evolution: FIX / DERIVED / CAPTURED

The evolution layer answers: *when should a skill change?*

- **FIX** — repair a broken or outdated skill.
- **DERIVED** — create a better or more specialized version from an existing skill.
- **CAPTURED** — save one reusable subworkflow, but only when the source trace shows
  **both** its execution **and** a separate validation of the claimed postcondition.
  Whole-task success is neither required nor sufficient on its own.
- **Independent capture review** — before commit, one bounded semantic review verifies
  that cited observations support the exact capability, and that the authored skill
  contains no broader or explicitly unverified procedure.

`evolver.py` implements FIX / DERIVED / CAPTURED with three triggers; `analyzer.py`
performs the post-execution analysis (agent loop + tool access) that feeds it;
`store.py` persists version DAGs and quality metrics in SQLite; `patch.py` applies
multi-file FULL / DIFF / PATCH updates.

## Trust lifecycle: provisional → trusted

- A validated evolved skill can be reused **immediately** as **provisional**.
- Independent successful use **promotes** it to **trusted**.
- An attributable failure **demotes** it.
- `enabled` controls reuse **independently** from this two-state trust lifecycle — a
  skill can be trusted but disabled, or provisional but enabled for testing.
- **Audit-only candidates** — blocked or uncertain proposals remain inspectable
  candidates. Recurrence never auto-rechecks or auto-promotes them into skills; a
  human/agent decision is still required.
- Complete history is tracked — how and why each skill changed over time (version
  lineage / evolution graph, browsable in the local dashboard).

## `.skill_id` sidecar

Each discovered skill has a `.skill_id` sidecar for stable tracking:

- New project or user skills can omit it — OpenSpace creates one on first discovery.
- Keep `.skill_id` when a copied skill should remain the *same logical skill*.
- Remove it before first discovery when creating an *independent* skill.
- `.skill_id` is skipped as a regular uploaded file during cloud upload.

## `check_skill_safety`

All discovered skills pass `check_skill_safety` before loading. Skills with dangerous
patterns — such as prompt injection or credential exfiltration — are blocked and
logged, regardless of their trust status.

## Cloud upload requires `trusted`

```bash
openspace-download-skill  # download a skill from the cloud
openspace-upload-skill --skill-dir /path/to/skill/dir  # upload a trusted skill
```

- Cloud upload requires the matching local SkillStore record to be **`trusted`**.
- Both **public and private** uploads fail closed for provisional or unknown records.
- The local trust state itself is **not** sent to the cloud.
- Cloud skills are grouped by **package** so people can browse and review them with
  context (visibility, history, quality signals) before an **explicit import** brings a
  cloud skill into a local skill folder for reuse.

## Terminal-Bench evidence

With the same frozen backbone, OpenSpace's score improves from a **65.2% cold run** to
a **78.7% warm run** on Terminal-Bench 2.1 as its trusted skill library evolves — this
is the upstream project's own cited evidence that the provisional → trusted evolution
loop measurably improves outcomes, not just adds bookkeeping.
