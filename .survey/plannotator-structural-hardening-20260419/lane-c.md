# Lane C: Actual behavior

## What People Actually Use
- Repo-local instruction files and runtime hooks/settings for hard approval policy, but manual review commands remain common when automatic interception is too eager or unsupported.
- Plan review when a concrete plan exists and the runtime can pause safely.
- Diff review when the first trustworthy artifact is a branch, commit range, or PR.
- Markdown/spec annotation as a workaround for spec-driven development, especially when users want to review repeated artifacts rather than a single plan blob.
- Remote-mode pinning (`PLANNOTATOR_REMOTE`, stable ports) when review links need to survive across sessions or across multiple reviewers.

## Common Workarounds
1. Use manual review or "review the last plan" behavior when auto-intercept feels intrusive.
2. Use diff review as the fallback gate on runtimes where plan interception is weak.
3. Use markdown annotation for specs/PRDs/architecture notes even when approval semantics are weaker.
4. Share exported artifacts or links when the real team-review surface is still GitHub or another PR-native tool.

## Pain Points With Current Solutions
- Automatic review triggers can fire in the wrong place or for the wrong agent.
- Codex setup and plan-review expectations are still confusing.
- Markdown/spec review lacks the same clean approval semantics as plan review.
- Rich downstream diff review can overshadow the narrower pre-code approval gate if the skill boundary is not explicit.

## Sources
- https://github.com/backnotprop/plannotator/issues/479
- https://github.com/backnotprop/plannotator/issues/570
- https://github.com/backnotprop/plannotator/issues/576
- https://github.com/backnotprop/plannotator/issues/589
- https://github.com/backnotprop/plannotator/releases/tag/v0.17.0
- https://github.com/backnotprop/plannotator/releases/tag/v0.17.1
