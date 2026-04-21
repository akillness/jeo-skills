# Loop Charter

## Goal
Improve `skill-autoresearch` so the front door decides earlier whether a ratchet is justified at all, instead of pushing maintainers straight into charter/baseline/mutation flow when the current artifact already passes or only support-sync drift exists.

## Current Baseline
`skill-autoresearch` already freezes evaluators, keeps one primary mutable artifact, and preserves append-only keep/revert discipline. The suspected gap is that the front door lacks a first-class `no ratchet justified` / `ratchet-eligibility` decision, so maintainers can over-enter mutation mode.

## Mutable Artifact
- Primary mutable artifact: `.agent-skills/skill-autoresearch/SKILL.md`

## Fixed Evaluation Harness
### Representative prompts / scenarios
1. "This skill already passes our frozen checks and reviewer feedback is good. Should we ratchet it anyway or stop?"
2. "I think the README/setup wording drifted after a previous improvement, but the main SKILL is still fine. What packet should we choose?"
3. "Improve this stale SKILL.md with fixed evals and keep/revert discipline."
4. "I need hosted traces, dataset comparisons, and experiment dashboards for our production AI app."
5. "We want to improve skill-autoresearch itself without exempting it from the loop."

### Binary evals
- E1: The front door explicitly allows a `no ratchet justified` / equivalent stop outcome before mutation.
- E2: The instructions distinguish support-sync-only drift from core mutation work early, not only after mutation begins.
- E3: Frozen evaluator + one-primary-artifact discipline remains explicit.
- E4: One-change mutation + keep/revert + append-only logging remains explicit.
- E5: Hosted eval platforms and ML `autoresearch` remain route-outs, not merged into this skill.
- E6: The resulting front door is not broader or noisier than baseline.

### Validators
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-autoresearch`
- `python3 -m json.tool .agent-skills/skill-autoresearch/evals/evals.json >/dev/null`
- `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root .`

## Constraints
- Max one primary semantic change to `SKILL.md` before any support-surface sync.
- Supporting files may change only if the main ratchet wins first.
- Keep the boundary with `autoresearch`, Promptfoo, LangSmith, Braintrust, and Weave explicit.
- Preserve compatibility with existing eval cases; add/update evals only after the main wording change is justified.
- Keep the run bounded to this skill and its directly derived discovery surfaces.

## Tried Already
- Keep: packet-first routing, frozen-harness discipline, explicit route-outs, append-only logs.
- Revert / avoid: adding another overlapping eval wrapper, broadening into hosted observability, or mixing README/setup churn ahead of the main skill contract.
- This run's hypothesis: adding an explicit ratchet-eligibility / no-change gate will improve trigger precision and reduce unnecessary loop churn without weakening the existing benchmark discipline.
