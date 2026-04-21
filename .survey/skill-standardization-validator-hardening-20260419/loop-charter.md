# Loop Charter

## Goal
Improve the reliability of `skill-standardization` by removing a false-failure path in `validate_skill.sh` for valid multiline YAML descriptions that contain apostrophes or shell-like text.

## Current Baseline
- Primary mutable artifact: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Current behavior: the validator uses `awk ... | xargs` to flatten multiline `description: >` blocks.
- Known regression: a temp `SKILL.md` containing `ClawTeam's` in a folded description triggers `xargs: unterminated quote` and aborts validation before the description checks finish.

## Mutable Artifact
Primary file: `.agent-skills/skill-standardization/scripts/validate_skill.sh`

Supporting files allowed if needed:
- `.agent-skills/skill-standardization/SKILL.md`
- `.agent-skills/skill-standardization/references/working-modes.md`
- `.agent-skills/skill-standardization/evals/evals.json`

## Fixed Evaluation Harness
- Reproduce the current failure with a temporary `problem-skill/SKILL.md` containing a folded description with `ClawTeam's`.
- Run `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/skill-standardization` from repo root.
- Run `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/oh-my-skills` only if discovery surfaces change materially.
- Manual check: supporting docs must explain the repaired validator behavior truthfully.

## Constraints
- Keep the run bounded to validator robustness; do not broaden into a full parser rewrite or add heavy new dependencies.
- Prefer a transferable fix over author-side wording workarounds.
- Preserve repo-root command truthfulness.
- Update only the smallest supporting surfaces needed.

## Tried Already
- Keep: survey evidence showing multiline descriptions are common and `xargs` quote parsing is the real footgun.
- Pending: replace `xargs` with quote-safe whitespace normalization and add a regression-oriented eval/doc note.
- Revert if: the new logic breaks the current validator on existing skills or requires larger dependency shifts.
