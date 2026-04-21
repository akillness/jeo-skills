# Context: code-refactoring modernization

## Workflow Context
Refactoring shows up inside feature delivery, bug follow-up, framework upgrades, API migrations, and review cleanup rather than as a separate maintenance phase. Modern practice combines IDE-safe local transforms, search-driven impact checks, small reviewable commits, tests as the behavior guardrail, and codemod-style automation when the same change must happen across many files or repos.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Application developer | Simplify complex code, remove duplication, and prepare safer feature work | Intermediate to advanced |
| Tech lead / staff engineer | Sequence larger module, API, and boundary refactors | Advanced |
| Platform / developer productivity engineer | Automate repetitive migrations with codemods or scripted transforms | Advanced |
| QA / SDET / reliability-minded maintainer | Preserve behavior with tests, fixtures, and regression checks during cleanup | Intermediate to advanced |
| New maintainer | Understand legacy code enough to rename, extract, and split safely | Intermediate |

## Current Workarounds
1. Use IDE-native rename / extract / move operations for local, symbol-safe edits.
2. Run grep, find-usages, or repo-wide search to catch string references, config, docs, and generated paths that tooling misses.
3. Add or lean on characterization tests before touching fragile code.
4. Split refactors into small commits so structural cleanup is reviewable separately from behavior changes.
5. Use codemods or structural rewrite tools only when the pattern is repeated enough to justify the setup cost.
6. Fall back to copy-paste-then-converge when automated transforms are too risky for dynamic or weakly indexed code.

## Adjacent Problems
- Weak tests or slow suites make refactors harder to trust.
- Developers often need code comprehension help before they can even choose the right refactor shape.
- Dynamic references, templates, reflection, and config wiring reduce confidence in automated changes.
- Large mechanical diffs overload review and increase merge-conflict risk.
- AI-assisted refactors still create a verification tax because teams must prove behavior stayed the same.

## User Voices
- "The hardest part is proving behavior did not change, not making the edit." — reflected across Fowler-style incremental refactoring guidance and IDE workflows. (https://martinfowler.com/books/refactoring.html)
- "I refactor in the middle of feature work because that is the only time it gets prioritized." — matches everyday IDE-centered refactoring usage. (https://code.visualstudio.com/docs/editor/refactoring, https://www.jetbrains.com/help/idea/refactoring-source-code.html)
- "I do not need help renaming one symbol; I need help safely changing the same pattern everywhere." — the practical reason codemod tools keep winning upgrade and migration work. (https://docs.openrewrite.org/, https://github.com/facebook/jscodeshift, https://ast-grep.github.io/)
