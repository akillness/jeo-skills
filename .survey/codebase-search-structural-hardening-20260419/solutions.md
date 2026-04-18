# Solution Landscape: codebase-search structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| ripgrep / git grep / grep / ag | Exact-text local search | Fast, ubiquitous, great for literals and scoped repo scans | No semantic understanding; noisy on common identifiers | Still the default starting point in many real workflows |
| GitHub / GitLab hosted code search | Hosted repo search | Great for remote repos, PR/browser flows, cross-repo lookup, shareable links | Platform syntax differs; less controllable than local tooling | Useful when local checkout/index is missing |
| LSP / ctags / indexed symbol search | Symbol-aware navigation | Better for definitions/references and large repos | Depends on index/tool health; weaker for generated/dynamic code | Should be a separate packet from plain grep |
| ast-grep / Semgrep / Comby | Structural / AST-aware search | Better for syntax-shaped queries and migration prep | Higher learning curve; more setup | Best for repeated pattern finding, not every lookup |
| Graph/code-map tools (CodeQL / SCIP / Searchfox / graphify-style tools) | Graph navigation / path tracing | Best for dependency tracing and architecture questions | Highest setup and complexity | Should be an escalated route, not the default front door |

## Categories
- **Exact-text search** — fast lookup for strings, env vars, file paths, error text, config keys, and known identifiers.
- **Hosted search** — good for remote/browser-first and cross-repo lookup.
- **Symbol/indexed search** — good for definitions, references, ownership, and API navigation.
- **Structural search** — good for syntax-shaped patterns, codemod prep, and repeated migration work.
- **Graph navigation** — good for dependency tracing, architecture mapping, and persistent structure questions.

## What People Actually Use
Most practitioners mix tools instead of relying on one search surface:
- start with `rg` / IDE search,
- narrow by path or package,
- jump to symbol-aware search if it is available,
- use hosted repo search for remote/historical/cross-repo lookup,
- copy identifiers or stack traces across terminal/editor/browser,
- escalate to graph or structural tools only when text search is too blunt.

## Frequency Ranking
1. Exact-text search
2. Hosted repo search
3. Symbol/indexed search
4. Structural search
5. Graph/code-map navigation

## Key Gaps
- The market has many search tools, but the recurring missing layer is **routing clarity**: users still need help deciding which search packet to use next.
- Generic search explainers often underperform because they blur text search, symbol search, config/content search, and graph tracing.
- Content/config-heavy repos and game repos expose trigger language that many code-search guides ignore.

## Contradictions
- Marketed claims often imply one search surface can solve everything; real workflows still bounce between terminal, IDE, browser, scripts, and specialized tools.
- Semantic/indexed search is powerful, but practitioners still fall back to plain text search when indexes are stale, code is generated, or the repo shape is mixed.

## Key Insight
The best bounded improvement is not another search-adjacent skill. It is shrinking `codebase-search` into a routing-first front door that chooses one packet — exact-text, symbol, structural, config/content, hosted, or graph/path tracing — then returns a compact evidence map and routes cleanly to `debugging`, `code-refactoring`, `code-review`, or `graphify`.
