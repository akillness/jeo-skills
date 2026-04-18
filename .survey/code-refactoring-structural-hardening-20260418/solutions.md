# Solution Landscape: code-refactoring structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Martin Fowler / Refactoring canon | Small behavior-preserving transformations guided by tests and incremental steps | Best conceptual anchor for safe cleanup | Not a tooling workflow by itself | Primary-source framing for the core skill boundary |
| IDE / local safe refactors | Rename/extract/move within one file or narrow module | Fast, low-friction, easy to review | Weak for repeated migrations or unknown behavior | Matches the skill's local safe refactor mode |
| Characterization / freeze-first workflow | Capture current behavior before broad edits | Best for fragile legacy areas | Slower; requires guardrail discipline | Keeps refactor work from collapsing into guesswork |
| jscodeshift | AST-based codemod runner for JS/TS | Strong for repeated migrations and style-preserving transforms | Language-specific; requires pilot/test loop | Best fit when the same API or pattern repeats across many files |
| OpenRewrite | Recipe-driven large-scale refactoring and migration engine | Strong for framework/security/stylistic migrations at repository scale | Heavier operational surface; broad ecosystem to learn | Better treated as a migration / recipe lane than local cleanup advice |
| ast-grep | Structural search, lint, and rewrite | Good middle ground for pattern-based structural changes | Requires pattern literacy; not always enough for semantic migrations | Useful when grep is too weak and full AST codemod is too much |
| Comby | Structural search-and-replace across syntax-aware templates | Useful for nested-syntax rewrites where regex breaks | Less semantically rich than full AST tooling | Good support example for repeated transform work |

## Categories
- **Conceptual safety model**: Fowler's small-step, behavior-preserving refactoring
- **Local cleanup workflow**: IDE refactors, narrow extracts, rename/move/decompose
- **Behavior freeze / characterization**: tests, fixtures, snapshots, captured examples before broad changes
- **Repeated migration / codemod**: jscodeshift, ast-grep, Comby, OpenRewrite
- **Adjacent-but-not-primary lanes**: debugging, code-review, testing strategy, performance tuning

## What People Actually Use
In practice, the space splits into three repeatable behaviors:
1. **Local cleanup with a fast verification path** for one file or module.
2. **Freeze-first cleanup** when the code is fragile and the current behavior is poorly understood.
3. **Pattern-based automation** for repeated migrations, followed by a pilot, diff review, and verification pass.

That matches the existing `code-refactoring` modes better than its stale compact surfaces do. The repo problem is not missing categories; it is that the front door still takes too long to reveal them and the compact discovery text still sounds like generic design-pattern tutoring.

## Frequency Ranking
1. Small-step, behavior-preserving refactor guidance
2. Behavior freeze / characterization before risky cleanup
3. Codemod / migration tooling for repeated changes
4. Structural search-and-rewrite tools between grep and full AST frameworks
5. Review / testing / perf as route-outs rather than core ownership

## Key Gaps
- The current skill still carries too much explanatory text in the front door relative to newer routing-first hardening passes.
- Compact discovery surfaces (`SKILL.toon`, `skills.toon`) still lag the real skill boundary.
- The skill can better separate **which packet the user has** (single file, fragile legacy area, repeated migration) from the downstream tactic.
- Eval coverage is solid, but a route-out case for pure search/navigation or performance-coupled cleanup would better protect boundaries.

## Contradictions
- Market/tooling reality says large-scale cleanup often needs dedicated codemod or recipe systems; stale compact surfaces still imply a broad manual-refactor/design-pattern helper.
- The repo's README/setup surfaces describe `code-refactoring` as a behavior-preserving structural-cleanup anchor, but the compact discovery files still over-emphasize DRY/SOLID/design patterns.

## Key Insight
The bounded win is not another code-quality wrapper. It is to harden `code-refactoring` into the same routing-first shape already applied to neighboring skills: start from one cleanup packet (local cleanup, fragile legacy area, repeated migration, or diff-shaping cleanup), move tactic detail into a focused support file, and sync compact/discovery surfaces so the cluster boundary stays truthful under fast skill selection.
