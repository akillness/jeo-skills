# Loop Charter

## Goal
Improve the `bmad` skill so it works as a portable BMAD/BMM core orchestrator: select project level, identify current phase, choose the next artifact, and route detailed work to adjacent skills instead of acting like a giant mixed command catalog.

## Current Baseline
- `.agent-skills/bmad/SKILL.md` validates with 0 errors but 5 warnings.
- Trigger quality is weak (`description` lacks explicit imperative phrasing and edge triggers).
- The main SKILL body contains too much install/platform/integration detail and too few standard sections.
- Standard support coverage is incomplete: no `references/` folder and no `evals/` folder.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/bmad/SKILL.md`

Supporting context files may be added or updated if the main skill needs them:
- `.agent-skills/bmad/references/*`
- `.agent-skills/bmad/evals/evals.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- `.agent-skills/skills.json`
- wiki / survey / graph artifacts required by the maintenance loop

## Fixed Evaluation Harness
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/bmad`
- `python3 -m json.tool .agent-skills/bmad/evals/evals.json >/dev/null` (if evals are added)
- `python3 -m json.tool .agent-skills/skills.json >/dev/null`
- Manual rubric:
  - `bmad` clearly explains when to use it
  - the core job is level/phase/next-artifact routing
  - adjacent responsibilities are pushed to `task-planning`, `plannotator`, `omc`, `ohmg`, `omx`, `bmad-gds`, or module references instead of duplicated
  - top-level discovery/setup docs reflect the new positioning

## Constraints
- Max one coherent improvement set this run
- Prefer modernization + support-file ratchet over creating a new overlapping skill
- Keep claims source-backed via local repo files and primary-source BMAD docs
- Do not widen the run into unrelated skill creation

## Tried Already
- Keep: modernize adjacent orchestrators first (`bmad-gds`, `ohmg`, `task-planning`, `plannotator` context)
- Revert: adding overlapping wrappers instead of sharpening core-vs-specialist boundaries
- Why: the strongest repo pattern so far is one clear anchor plus narrow downstream specialists
