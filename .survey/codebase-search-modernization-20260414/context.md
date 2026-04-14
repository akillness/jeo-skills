# Context: codebase-search modernization

## Workflow Context
The current repo state points to `codebase-search` as the next high-leverage search-analysis modernization candidate:
- It is indexed in `README.md`, `README.ko.md`, and `setup-all-skills-prompt.md`, so discovery wording directly affects activation.
- Adjacent modernized skills already route pure inventory / impact-mapping work into `codebase-search`, especially `code-refactoring`.
- The current `SKILL.md` is a 500+ line legacy catalog that mixes semantic search, grep recipes, AST analysis, and language-specific snippets without a clear decision ladder.

Research signals used in this run:
- Repo evidence from `README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/codebase-search/SKILL.md`, and route-outs from `code-refactoring`.
- Primary-source docs recovered via direct page retrieval because `web_search` / `web_extract` returned `401 Invalid API key` in this environment.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Agent doing repo triage | Find ownership, call sites, configs, and impact surface before changing code | Intermediate |
| App/backend engineer | Trace feature flow, schema usage, and integration points in large repos | Intermediate to advanced |
| Frontend/fullstack engineer | Map component/state/API touchpoints before UI or product changes | Intermediate |
| Product/ops automation builder | Locate workflow logic, prompts, templates, and reporting jobs across mixed repos | Intermediate |
| Game/tooling developer | Find engine subsystems, build scripts, content pipelines, and platform hooks | Intermediate to advanced |

## Current Workarounds
1. Start with broad text search (`rg` / ripgrep), then manually narrow by directory and file type.
2. Switch to hosted code search for symbol or repository-wide queries when local grep is too blunt.
3. Use AST-aware tools only for structural queries or codemod-adjacent work.
4. Fall back to manual file reading and handwritten trace notes for impact analysis.
5. Route into debugging/refactoring/review work only after building an evidence map.

Limitations of the current skill:
- It over-indexes on tool syntax instead of search intent.
- It does not clearly separate exact-text search, symbol search, structural search, and architecture/ownership mapping.
- It lacks reusable support files (`references/`, `evals/`) for ratcheting future improvements.

## Adjacent Problems
- Weak repo-navigation guidance causes `debugging` or `code-refactoring` to absorb pure discovery work.
- Missing route-outs blur the boundary between search, diagnosis, and change planning.
- Large command catalogs age badly across platforms and language ecosystems.
- Without evals, future edits can drift back toward keyword-stuffing or tool-specific trivia.

## User Voices
- GitHub Docs: “You can build search queries for the results you want with specialized code qualifiers, regular expressions, and boolean operations.”
  Source: https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax
- Sourcegraph Docs: Code Search helps users “utilize regular expressions, boolean operations, and keyboard shortcuts” and includes symbol-oriented capabilities.
  Source: https://sourcegraph.com/docs/code_search
- ast-grep positions itself as “a tool to search and transform code” with syntax-aware matching rather than plain text.
  Source: https://ast-grep.github.io/guide/introduction.html
- ripgrep is described as recursively searching directories for a regex while respecting `.gitignore`.
  Source: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
