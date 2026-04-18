# Context: code-refactoring structural hardening

## Workflow Context
`code-refactoring` sits in the code-quality lane between diagnosis (`debugging`), review judgment (`code-review`), validation-policy design (`testing-strategies`), search/navigation (`codebase-search`), and measurement-led tuning (`performance-optimization`). The repo's current cluster notes already frame it as the structural-cleanup owner, but `graphify-out/GRAPH_REPORT.md` still flags the skill as oversized and the compact discovery surfaces still describe it like a generic design-pattern / SOLID helper.

External workflow evidence points in the same direction:
- Martin Fowler's `Refactoring` page defines refactoring as a controlled technique based on **small behavior-preserving transformations** and explicitly ties the process to testing and low-risk incremental change. Source: https://martinfowler.com/books/refactoring.html
- `facebook/jscodeshift` presents itself as a toolkit for running codemods over multiple JavaScript/TypeScript files, with an AST-based transform layer that tries to preserve original code style. Source: https://raw.githubusercontent.com/facebook/jscodeshift/main/README.md
- `openrewrite/rewrite` positions itself as automated mass refactoring with prepackaged recipes for framework migrations, security fixes, and stylistic consistency tasks. Source: https://raw.githubusercontent.com/openrewrite/rewrite/main/README.md
- `ast-grep` positions itself as structural search, lint, and rewriting for code patterns, reinforcing that repeated migrations belong to a distinct tool-assisted lane rather than ad hoc manual cleanup. Source: https://raw.githubusercontent.com/ast-grep/ast-grep/main/README.md
- `comby` emphasizes that small rewrites become hard when regex meets nested syntax, comments, or strings, which supports keeping repetitive migration / codemod guidance explicit. Source: https://raw.githubusercontent.com/comby-tools/comby/master/README.md

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application engineer | Clean up complex services, components, handlers, and modules without changing behavior | Intermediate |
| Staff / tech lead | Stage safer migrations, split mechanical cleanup from semantic change, and keep diffs reviewable | Advanced |
| Agent maintainer | Route cleanup asks away from debugging, review, test-policy, or perf lanes when the user really wants structure cleanup | Intermediate |
| Game / tooling programmer | Untangle gameplay, build-script, editor-tool, or pipeline code before adding new work | Intermediate |

## Current Workarounds
1. Use `code-refactoring` directly, but read a long SKILL.md before reaching the actual mode decision.
   - Limitation: the front door is denser than newer routing-first skills in adjacent clusters.
2. Infer the correct boundary from README text instead of the compact surfaces.
   - Limitation: `SKILL.toon` and `skills.toon` still advertise generic design-pattern / SOLID cleanup, so trigger surfaces drift.
3. Reach for neighboring skills (`debugging`, `code-review`, `performance-optimization`) when the request is really a structure cleanup with verification.
   - Limitation: misroutes grow when the front door does not make the cleanup-vs-diagnosis-vs-review split immediately obvious.
4. Treat repo-wide migrations as just a larger local refactor.
   - Limitation: external tool ecosystems (`jscodeshift`, `OpenRewrite`, `ast-grep`, `comby`) show that repeated migrations need sample-first automation and explicit verification loops.

## Adjacent Problems
- Oversized front doors reduce trigger precision even when support coverage is complete.
- Compact discovery drift (`SKILL.toon`, `skills.toon`) can outlive a good rewrite and quietly reintroduce stale positioning.
- The code-quality cluster becomes noisier if refactor work absorbs diagnosis, review judgment, or test-policy design.
- Migration-scale cleanup needs tool choice (`codemod`, structural rewrite, search/replace, recipe engine) instead of generic “apply SOLID” advice.

## User Voices
> "Refactoring is a controlled technique for improving the design of an existing code base." — Martin Fowler, *Refactoring* (https://martinfowler.com/books/refactoring.html)

> "Its essence is applying a series of small behavior-preserving transformations... By doing them in small steps you reduce the risk of introducing errors." — Martin Fowler, *Refactoring* (https://martinfowler.com/books/refactoring.html)

> "jscodeshift is a toolkit for running codemods over multiple JavaScript or TypeScript files." — `facebook/jscodeshift` README (https://raw.githubusercontent.com/facebook/jscodeshift/main/README.md)

> "AST-to-AST transform tool and also tries to preserve the style of original code" — `facebook/jscodeshift` README, describing recast within the toolkit (https://raw.githubusercontent.com/facebook/jscodeshift/main/README.md)

> "Fast, repeatable refactoring for developers" / "automated refactoring ecosystem" — `openrewrite/rewrite` README (https://raw.githubusercontent.com/openrewrite/rewrite/main/README.md)
