# Loop Charter

## Goal
Improve `pattern-detection` so it becomes a reusable, high-signal pattern/rule/anomaly hunting skill with clear mode selection, stronger trigger wording, explicit route-outs, and practical support files.

## Current Baseline
Current `pattern-detection` is a legacy catch-all centered on grep/regex snippets and a mixed bag of code-smell, security, and statistical examples. It lacks references/evals, does not clearly separate code-structure detection from log/metric anomaly work, and overlaps too much with `data-analysis`, `log-analysis`, and security/code-review skills.

## Mutable Artifact
Primary mutable artifact: `.agent-skills/pattern-detection/SKILL.md`

Supporting artifacts allowed if they directly improve usefulness and validation:
- `.agent-skills/pattern-detection/references/*`
- `.agent-skills/pattern-detection/evals/evals.json`
- README / README.ko / setup-all-skills-prompt.md / .agent-skills/skills.json if the stronger positioning changes discovery surfaces
- wiki / graph / survey files for durable run memory

## Fixed Evaluation Harness
- Skill must comply with Agent Skills structure expectations: clear frontmatter, strong trigger-oriented description, `## When to use this skill`, `## Instructions`, `## Examples`, `## Best practices`, `## References`, and a bounded output format.
- Improvement must clarify lane selection across: code structure, log/event patterns, metric anomalies, and repeated rule hunting.
- Improvement must add explicit route-outs to adjacent skills where pattern detection is no longer the bottleneck.
- Improvement must add support files only if they transfer across multiple prompts.
- Validation prompts:
  1. "Scan this repo for repeated risky error-handling patterns and tell me what to inspect first."
  2. "We have a KPI spike in a CSV export — should this be pattern-detection or data-analysis?"
  3. "Look for suspicious gameplay telemetry outliers after yesterday's update."
  4. "I need reusable rules for finding unsafe code shapes, not a full security audit."
- Discovery surfaces should reflect the sharper role if wording materially changes how the skill is chosen.

## Constraints
- One bounded modernization run; do not create a second overlapping skill.
- Prefer transferable workflow structure over tool-name dumping.
- Keep the skill focused on detection/triage, not full remediation, dashboard building, or generic analytics reporting.
- Use source-backed survey findings gathered this run.
- Keep/revert rule: keep the revision only if it is clearly narrower, more reusable, and better routed than the baseline under the prompts above.

## Tried Already
- Keep: modernize nearby search-analysis and analysis anchors (`log-analysis`, `data-analysis`, `codebase-search`) before revisiting `pattern-detection`.
- Revert: adding overlapping wrapper skills instead of improving the existing anchor.
- Why: the repo gets more leverage from tightening boundaries inside the existing cluster than from adding another generic analysis skill.
