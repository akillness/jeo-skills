# Solution Landscape: code-refactoring modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| IntelliJ IDEA / JetBrains refactorings | IDE-native semantic refactoring | Strong rename/extract/move/change-signature workflows with previews | Mostly local to supported language models and project indexing | Trusted baseline for safe local transforms |
| Visual Studio / ReSharper / Rider | IDE-native semantic refactoring | Mature symbol-aware refactors for .NET-heavy codebases | Less helpful for cross-repo or mixed-stack migrations | Strong enterprise local workflow anchor |
| VS Code refactor actions | Lightweight editor-native refactoring | Ubiquitous and fast for supported language servers | Depth varies by extension and language | Good local default, weaker for large campaigns |
| OpenRewrite / Moderne | Recipe-driven large-scale refactoring | Excellent for repeatable migrations, deprecations, and fleet upgrades | Higher setup cost and recipe maintenance burden | Strongest repo-scale modernization story |
| jscodeshift / Babel transforms | JS/TS codemods | Powerful for framework and API migrations | Requires AST/codemod authoring skill | Common frontend/fullstack migration layer |
| ast-grep / Comby | Structural search-and-rewrite | Faster setup than full compiler APIs, good middle ground | Less semantic safety than deep IDE or compiler tooling | Useful when grep is too weak and codemods are too heavy |
| ESLint / Semgrep autofix / Sonar-assisted cleanup | Rule-driven autofix | Great for low-risk repetitive cleanup | Too shallow for deeper design refactors | Best as guardrail, not the whole workflow |
| AI-assisted editors and assistants | Conversational refactor drafting | Fast at localized cleanup and repetitive edits | Requires strong human verification and route-outs | Good accelerator, not a replacement for tests and review |

## Categories
- IDE-native semantic refactoring
- Codemod / AST transformation frameworks
- Structural search-and-rewrite tools
- Static-analysis autofix
- AI-assisted refactoring

## What People Actually Use
Most teams mix tools instead of trusting one layer: IDE-safe refactors for local moves, search and tests for verification, interactive/staged commits for reviewability, and codemods only when the change repeats enough to justify automation.

## Frequency Ranking
1. IDE-native refactorings (`rename`, `extract`, `move`, `change signature`)
2. Search + tests + small commits as the real safety loop
3. AI-assisted local cleanup and draft rewrites
4. Codemods for large repeated migrations
5. Static-analysis autofix for low-risk cleanup

## Key Gaps
- Many tools are strong at local symbol-aware edits but weak at mixed code + config + docs + generated-artifact change sets.
- AI-assisted refactors often skip explicit verification planning.
- Legacy guidance often over-focuses on patterns and under-specifies how to keep refactors reviewable and behavior-safe.

## Contradictions
- Marketed promise: automated refactoring removes toil.
- User reality: tests, search, previews, and split commits still decide whether a refactor is trustworthy.

## Key Insight
The highest-value `code-refactoring` skill is not a catalog of design-pattern examples. It is a route-aware workflow that helps agents choose between local semantic cleanup, behavior-freezing preparation, and repetitive migration automation while keeping tests, search, and reviewability explicit.
