# Solution Landscape: codebase-search modernization

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| GitHub Code Search | Hosted repository/symbol search with qualifiers, regex, and boolean operators | Good for repo-wide symbol lookup, qualifiers, and hosted repos already on GitHub | Still query-centric; does not replace local file reading or structural rewrites | Source: https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax |
| Sourcegraph Code Search | Indexed code navigation with symbol/code-navigation features | Strong for large multi-repo search and symbol-aware exploration | External platform dependency; not always the local default | Source: https://sourcegraph.com/docs/code_search |
| ast-grep | AST-aware structural search and transform | Best when syntax structure matters more than exact text | Higher setup/mental overhead than plain grep | Source: https://ast-grep.github.io/guide/introduction.html |
| ripgrep | Local exact/regex search that respects ignore rules | Fast default starting point for known text/patterns | Not syntax-aware; can over-match without scoping | Source: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md |
| Manual trace map + file reading | Human/agent-written evidence map across files and boundaries | Still required to explain architecture and choose next actions | Slow and inconsistent without a standard workflow | Repo observation from current `codebase-search` usage and adjacent skill route-outs |

## Categories
- **Hosted indexed search**: GitHub Code Search, Sourcegraph
- **Local exact/regex search**: ripgrep
- **Structural search**: ast-grep
- **Synthesis layer**: manual trace map + targeted file reading

## What People Actually Use
In practice, codebase discovery is still a layered workflow rather than a single tool:
1. Start with the cheapest broad search (usually ripgrep or repository-native code search).
2. Narrow by path, language, symbol, or qualifier.
3. Escalate to structural search only when text search is too noisy.
4. Read the actual files and write down the evidence map before editing, debugging, or refactoring.

## Frequency Ranking
1. ripgrep / regex search — universal default for known terms and local repos
2. GitHub Code Search / hosted symbol search — common second step for indexed repositories
3. Manual trace mapping — still unavoidable for architecture understanding and impact analysis
4. AST-aware search (ast-grep) — high-value but narrower, usually for structural patterns or codemod prep
5. Heavy platform code intelligence (Sourcegraph) — strong in large/multi-repo environments but not the universal default

## Key Gaps
- The repo still lacks a modern skill that teaches when to choose text search vs symbol search vs structural search.
- Existing content does not standardize the output artifact of a search pass: scope, evidence, hotspots, and next route-out.
- There is no eval coverage for trigger precision or for handoff quality into debugging/refactoring/review.

## Contradictions
- Vendor docs imply powerful search capability, but actual repo work still falls back to manual evidence maps and file reading.
- Legacy skill drafts often present one long search-command list, while real workflows depend on staged narrowing and explicit handoff boundaries.

## Key Insight
The highest-value improvement is not adding another search tool wrapper. It is turning `codebase-search` into a search-strategy router: choose the right search lane, capture findings in a small evidence map, and hand off cleanly to debugging, refactoring, review, or architecture analysis.
