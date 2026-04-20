# Run Packets and Route-outs

Use this reference to keep `skill-autoresearch` small at the front door.

## Packet chooser

### 1. `ratchet-eligibility`
Use before the loop expands.

Ask:
- does the baseline already satisfy the current bar?
- is the real problem only support-surface drift?
- is there concrete evidence that more mutation is worth the churn?

Deliverable:
- one of `no ratchet justified`, `support-sync`, or `continue into benchmark loop`

### 2. `benchmark-readiness`
Use when the maintainer wants to improve a skill or workflow doc but the run still lacks:
- a stable prompt/scenario set
- binary evals
- a scope limit
- a clear primary mutable artifact

Deliverable:
- a short readiness brief listing what is missing before the ratchet can begin

### 3. `charter-freeze`
Use when the inputs exist but the run contract is still loose.

Deliverable:
- `loop-charter.md` with goal, baseline, mutable artifact, fixed evaluation harness, constraints, and rejected directions

### 4. `baseline-score`
Use when the harness is frozen and the current version must be measured before edits.

Deliverable:
- baseline copy
- experiment `0`
- summary of current failures

### 5. `one-change-mutation`
Use when the maintainer already knows the highest-value failure and wants one bounded edit.

Good candidates:
- weak trigger wording
- noisy boundary/route-out wording
- buried critical rule
- one missing support file that closes a clear gap
- front-door bloat that can move into a stable reference

Deliverable:
- one mutation
- rerun on the same harness
- keep or revert decision

### 6. `support-sync`
Use only after the main ratchet holds.

Candidate surfaces:
- `evals/evals.json`
- `SKILL.toon` / compact variants
- `skills.json` / aggregate discovery files
- `README.md`, localized READMEs, setup prompts

Deliverable:
- synced discovery/support surfaces with the same boundary wording as the main artifact

### 7. `final-report`
Use when the run is complete or when no justified ratchet exists.

Deliverable:
- baseline to final score, or a clear `no ratchet justified` result
- keep vs revert count
- top changes or the reason mutation was skipped
- remaining failures
- artifact paths

### 8. `route-out`
Use when the real request belongs elsewhere.

## Route-outs that matter

### Route to `autoresearch`
If the real workflow is:
- `program.md`
- `train.py`
- immutable `prepare.py`
- `val_bpb`
- GPU-bound experiment loops

That is ML autoresearch, not repo-local skill ratcheting.

### Route to hosted eval / observability platforms
If the user mainly needs:
- online traces
- production dashboards
- dataset management
- app or agent runtime observability
- hosted experiment comparison across deployed systems

Use tools like Promptfoo, LangSmith, Braintrust, or Weave instead of stretching this skill.

### Route to `skill-standardization`
If the job is a direct spec-compliance cleanup, path/layout fix, or catalog-sync validation without needing an iterative benchmark loop.

### Route to the domain skill itself
If the improvement target is already obvious and the user wants implementation now rather than a ratchet loop.

## Secondary win rule
A smaller front door is a valid win **only when**:
- the same frozen harness still passes, and
- the moved detail remains reachable in support files.

Do not delete critical detail just to reduce line count.

## Suggested log row
| Iteration | Target | Hypothesis | Change | Validation result | Keep/Revert | Notes |
|---|---|---|---|---|---|---|
| 1 | SKILL.md | moving packet detail to a reference will preserve clarity while shrinking the front door | add `run-packets-and-route-outs.md`; tighten SKILL.md | spec passes; route-out clarity improves | Keep | secondary win: smaller front door |
