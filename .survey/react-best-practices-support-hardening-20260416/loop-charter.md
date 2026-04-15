# Loop Charter

## Goal
Improve the practical usefulness of `.agent-skills/react-best-practices` without creating a new overlapping skill.

## Current Baseline
- `react-best-practices` is the canonical React / Next.js performance skill.
- It already has evals and a compact file, but still relies on a single large `AGENTS.md` instead of a focused `references/` bundle.
- Peer frontend anchors (`state-management`, `responsive-design`, `web-accessibility`, `ui-component-patterns`) already use smaller support packets and clearer route-outs.

## Mutable Artifact
Primary: `.agent-skills/react-best-practices/SKILL.md`

Supporting files allowed only if the primary direction proves useful:
- `.agent-skills/react-best-practices/references/*`
- `.agent-skills/react-best-practices/SKILL.toon`
- `.agent-skills/skills.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- wiki / survey / graph artifacts directly documenting the same decision

## Fixed Evaluation Harness
- Skill must pass `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/react-best-practices`
- Repo catalog must pass `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- The updated skill must keep the canonical-vs-alias boundary with `vercel-react-best-practices`
- The updated skill must be more usable for measurement-first triage and route-outs than the baseline
- No new overlapping React / Next.js wrapper skill may be added in this run

## Constraints
- Max one coherent improvement set this run
- Prefer small reference packets over giant support-doc rewrites
- Keep reuse transferable across React / Next.js perf tasks
- Do not change the evaluator mid-run
- Do not commit directly to `main`

## Tried Already
- Keep: canonicalized `react-best-practices` and narrowed `vercel-react-best-practices` into an alias on 2026-04-12
- Revert: adding another overlapping frontend skill
- Why: the canonical-vs-alias boundary was the right first move; the remaining gap is support packaging, not another split
