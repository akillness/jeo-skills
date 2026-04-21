# Review Modes

Use `code-review` as a decision skill, not a giant static checklist.

## 1. General change review
Use for ordinary diffs / PRs where the main question is whether the change is safe and maintainable.

Primary checks:
- correctness of the changed behavior
- edge cases and failure paths
- maintainability of the implementation
- missing validation evidence

## 2. Backend / platform review
Reach for this mode when the diff changes APIs, jobs, schemas, permissions, or deployment behavior.

Look especially at:
- backward compatibility
- schema migration safety
- authz/authn or trust-boundary changes
- rollback assumptions
- missing tests for failure paths and edge cases

## 3. Frontend / UX-adjacent review
Use when the diff changes interaction states, responsive behavior, forms, or UI rendering.

Primary rule:
- code review can judge implementation quality
- screenshots, previews, or recordings may still be required to judge behavior/layout

Ask for additional evidence when the diff alone cannot show:
- hover/focus/error states
- mobile vs desktop behavior
- animation or timing behavior
- before/after visual changes

## 4. Game-programming / engine review
Use when the code is part of gameplay, tooling, engine integration, or data-driven game logic.

Focus on:
- determinism / state sync assumptions
- config and data coupling
- gameplay side effects
- what still requires manual playtest or engine validation

Do not pretend binary assets or editor-side behavior are fully reviewable from the code diff alone.

## 5. Policy / meta review
Use when the highest-value review finding is not inside a single line of code.

Examples:
- change is too large to review confidently
- PR lacks clear description or evidence
- migration has no rollout notes
- screenshots or previews are missing
- tests are absent for the core risk

## Core heuristic
If the most important comment is about **how the change should be judged or evidenced**, start there before offering line-level nits.
