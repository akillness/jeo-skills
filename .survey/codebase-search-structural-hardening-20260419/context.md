# Context: codebase-search structural hardening

## Workflow Context
Repository search pain appears in several different shapes, not one generic "search the codebase" request:
- CLI/dev workflow: developers need a fast answer to "where is this string, symbol, or config defined?" and fall back to recursive search tools like `ripgrep` when higher-level search is unclear.
- Web/fullstack: requests span routes, components, APIs, schemas, tests, and configs, so users often need a packet choice between exact-text, symbol, structural, and impact tracing.
- Product/ops/infrastructure repos: the real job is often tracing Terraform/Kubernetes/module ownership rather than locating app code.
- Marketing/content repos: users search front matter, MDX/Markdown, shortcodes, partials, campaign IDs, and template includes more often than functions/classes.
- Game repos: visual graphs, engine configs, assets, and build scripts make plain code-only search insufficient.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| CLI-heavy developers | Fast local repo navigation before changing code | Intermediate–advanced |
| Frontend/fullstack engineers | Trace UI → API → config/test flow and impact | Intermediate–advanced |
| Platform / ops maintainers | Find ownership across infra/config/module layers | Intermediate–advanced |
| Marketing/content maintainers | Locate content metadata, reusable partials, and template references | Intermediate |
| Gameplay / tools engineers | Trace code + config + asset / visual-graph references | Intermediate–advanced |

## Current Workarounds
1. Start with `rg` / `git grep` / IDE search, then manually narrow by path, file type, or package.
2. Switch to hosted repo search (GitHub/GitLab/etc.) when the repo is remote, the user is in a PR/browser flow, or local checkout/indexing is missing.
3. Use symbol-aware navigation only when LSP/ctags/indexes are available and trustworthy.
4. Write ad hoc shell/Python helpers for structured config/content search in YAML, JSON, Markdown, Terraform, or site-template repos.
5. Fall back to engine/editor-native search in game workflows when important references live outside plain source files.

## Adjacent Problems
- Search requests are often misrouted because users ask for "where is this configured?", "what uses this?", or "which page still references this?" instead of explicitly saying "search the codebase".
- Text search, symbol search, structural search, and graph/path tracing are different jobs and should not be flattened into one generic search explanation.
- Repo search often becomes impact mapping, then diagnosis, then refactoring; boundary clarity matters more than listing every search command.
- Content/config-heavy repos blur "code search" into repository archaeology, which means trigger wording should cover config/content ownership without absorbing data analysis or debugging.

## User Voices
- GitHub framed new code search around helping developers **find, understand, and navigate code** in large repositories: https://github.blog/2023-02-14-introducing-githubs-new-code-search/
- GitHub’s code-search docs emphasize qualifiers, regex, path filters, and symbol-aware search because literal text search is not sufficient in modern repos: https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax
- The `ripgrep` project exists because developers repeatedly need fast recursive search that respects ignore rules: https://github.com/BurntSushi/ripgrep
- Unreal ships a dedicated Blueprint Search / Find in Blueprints flow because game-repo navigation often extends beyond plain source files: https://dev.epicgames.com/documentation/en-us/unreal-engine/blueprint-search?application_version=4.27
