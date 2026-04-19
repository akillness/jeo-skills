---
title: Skill Standardization Validator Hardening
created: 2026-04-19
updated: 2026-04-19
type: query
tags: [skills, skill-quality, trigger-design, survey]
sources: [.survey/skill-standardization-validator-hardening-20260419/triage.md, .survey/skill-standardization-validator-hardening-20260419/context.md, .survey/skill-standardization-validator-hardening-20260419/solutions.md, .survey/skill-standardization-validator-hardening-20260419/loop-charter.md, .agent-skills/skill-standardization/SKILL.md, .agent-skills/skill-standardization/references/working-modes.md, .agent-skills/skill-standardization/evals/evals.json, .agent-skills/skill-standardization/scripts/validate_skill.sh, .agent-skills/skill-standardization/scripts/regression_folded_description_quotes.sh]
---

# Skill Standardization Validator Hardening

## Question
What is the best bounded follow-up for `skill-standardization` now that the remaining problem is evaluator reliability rather than missing support coverage?

## Answer
Keep the existing shell validator, but remove the `xargs` quote-parsing footgun from folded-description handling and add a durable regression path. The winning change is to repair the evaluator so valid multiline descriptions with apostrophes remain valid input, instead of teaching authors to weaken natural-language descriptions for shell compatibility.

## Why this won
- The survey found that multiline descriptions are routine in skill ecosystems, and this repo already has 82 live `SKILL.md` files using folded or literal `description` blocks.
- A repo-local scan showed 53 of those multiline descriptions already contain apostrophes, quotes, backticks, or shell-like text, so the bug sat directly in the normal maintenance path.
- The baseline failure reproduced locally: a temporary skill using `ClawTeam's` in a folded description caused `validate_skill.sh` to abort with `xargs: unterminated quote` before description validation finished.
- A shell-only repair is the smallest transferable fix: it preserves repo portability and keeps the current validator architecture intact while eliminating false failures.

## Accepted change shape
- Patch `.agent-skills/skill-standardization/scripts/validate_skill.sh` so multiline descriptions are flattened with quote-safe Python normalization instead of `awk | xargs`.
- Update `skill-standardization/SKILL.md` so the durable guidance treats prose-level quoting failures as validator bugs to repair, not as a reason to rewrite the skill.
- Update `references/working-modes.md` so validator coverage explicitly includes quote-safe folded-description extraction.
- Expand `evals/evals.json` with a folded-description apostrophe case.
- Add `scripts/regression_folded_description_quotes.sh` so the same parser edge case can be rechecked quickly in future maintenance runs.

## Rejected alternatives
- Keeping the bug and telling authors to replace apostrophes or shell-like wording.
- Broadening the run into a full dependency shift to `yq`, `python-frontmatter`, or another parser stack before the bounded shell fix is exhausted.
- Downgrading the validator to a shallower grep-only check that gives up useful description validation.

## Durable note
This run sharpened the boundary between `skill-autoresearch` and `skill-standardization`: the former freezes the judging harness, while the latter must keep that harness truthful. Once support coverage is complete, meta-skill value often comes from evaluator reliability and regression capture instead of more reference text.

## Related pages
- [[skill-standardization-structural-hardening-2026-04-17]]
- [[skill-standardization-variant-sync-2026-04-15]]
- [[skill-support-coverage]]
- [[survey-artifact-validator-hardening-2026-04-19]]
