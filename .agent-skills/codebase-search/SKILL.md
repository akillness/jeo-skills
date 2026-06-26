---
name: codebase-search
description: ">"
allowed-tools: Read Grep Glob Bash
metadata:
  tags: codebase-search, code-navigation, repo-triage, impact-analysis, grep, ripgrep, ast-grep
  platforms: Claude, ChatGPT, Gemini, Codex
  version: 2.1
---






# Codebase Search

## When to use this skill
- The main job is **repo navigation before edits**.
- The user needs to find **definitions, call sites, entry points, config owners, tests, templates, content references, or likely impact surface**.
- The repo is large enough that random file reading will waste time.
- The request is really **"where does this live / what uses it / what should I inspect first?"** even if the user never says "search".
- The repo may be **app code, infra/config, content/templates, or game tooling/assets**, and the first step is still discovery.

Do **not** use this skill as the main workflow when:
- The user already found the area and now needs root-cause diagnosis → use `debugging` or `log-analysis`.
- The user wants a behavior-preserving cleanup or migration plan → use `code-refactoring`.
- The user wants judgment on a concrete diff / PR → use `code-review`.
- The user wants a persistent whole-repo or mixed-corpus structure map → use `graphify`.

## Core idea
`codebase-search` should act like a **packet router**, not a giant search tutorial.

1. Normalize the request into **one primary packet**.
2. Narrow scope before dumping matches.
3. Read only the winning files.
4. Return a compact evidence map.
5. Route out as soon as search is no longer the bottleneck.

Read these support docs before choosing the packet:
- [references/intake-packets-and-route-outs.md](references/intake-packets-and-route-outs.md)
- [references/search-modes.md](references/search-modes.md)
- [references/evidence-map-template.md](references/evidence-map-template.md)
- [references/handoff-boundaries.md](references/handoff-boundaries.md)

## Instructions

### Step 1: Normalize the request
Convert the prompt into this intake shape first:

```yaml
codebase_search_packet:
  primary_packet: exact-text | symbol-indexed | structural | config-content | hosted-search | graph-path
  repo_shape: app | infra | content | game | mixed | unknown
  search_goal: locate | references | ownership | impact | archaeology | unknown
  scope_hint: path | package | file-type | subsystem | repo-wide | unknown
  route_after: stay-here | debugging | log-analysis | code-refactoring | code-review | graphify
```

Choose **one** primary packet for the run. If two seem plausible, pick the cheaper one that reduces uncertainty fastest.

### Step 2: Choose the packet

| Packet | Use when | Best fits | Common tools / shapes |
|---|---|---|---|
| `exact-text` | The user knows a string, env var, route, flag, class name spelling, error text, or file fragment | literal lookups, config keys, route paths, import names | `rg`, `git grep`, editor search |
| `symbol-indexed` | The user needs definitions, references, or call sites | function/class/interface ownership, API tracing, monorepo navigation | LSP/workspace symbol, ctags, indexed repo search |
| `structural` | Syntax shape matters more than literal text | missing cleanup, unsafe pattern inventories, migration prep | ast-grep, Semgrep, Comby, tree-sitter-style search |
| `config-content` | The repo surface is config, content, templates, front matter, shortcodes, scenes, assets, or build scripts | Terraform/Kubernetes, Markdown/MDX sites, Hugo/Next content, game packaging/config | file discovery + exact-text + targeted scripts |
| `hosted-search` | The repo is remote/browser-first or cross-repo lookup matters | PR archaeology, repo you do not have locally, shareable links | GitHub/GitLab hosted search |
| `graph-path` | The request is really about dependency tracing or persistent structure | call graph, path tracing, architecture map, graph report | `graphify`, code graph/code map tools |

Packet rules:
- Prefer `exact-text` when the user already has a concrete token.
- Prefer `symbol-indexed` for “where is this defined / referenced?”
- Prefer `structural` only when regex would be too blunt.
- Prefer `config-content` when the real surface is not classic source code.
- Prefer `hosted-search` when local context is missing.
- Prefer `graph-path` only when ordinary search is no longer enough.

### Step 3: Narrow scope before reading everything
Apply at least one narrowing move before reading files:
- limit by directory or package
- limit by file type
- separate authored files from generated/vendor folders
- start with entry points, loaders, config schemas, tests, examples, or build scripts
- in content/game repos, search metadata + template/asset surfaces before assuming code owns the answer

Useful heuristics by repo shape:
- **app** → start with entry point, router/handler, config loader, test
- **infra** → start with module/overlay/root config, variable/schema, deployment surface
- **content** → start with content folder, front matter key, partial/include/shortcode/template
- **game** → start with runtime code, engine config, scene/asset/build script, editor/visual graph references

### Step 4: Read winners, not the whole match list
After the search packet returns matches:
1. pick the most likely definition / ownership file
2. pick 1–3 important consumers or references
3. pick 1 config/test/example/build file when setup matters
4. summarize the flow instead of pasting raw terminal output

### Step 5: Return an evidence map
Default response shape:

```markdown
## Search brief
- Goal: [what I was locating]
- Packet: exact-text | symbol-indexed | structural | config-content | hosted-search | graph-path
- Scope: [paths/file types/packages]

## Best entry points
- `path/to/file`: why it matters
- `path/to/other-file`: why it matters

## Key evidence
- `path:line` — what it shows
- `path:line` — how it connects

## Likely flow / ownership
- entry → consumer → config/test/content surface

## Next route-out
- stay in `codebase-search` or route to the next skill
```

### Step 6: Use packet-specific heuristics

#### For bug-location requests
- start from the error string, route, flag, or recent change token
- locate the definition plus highest-signal consumers
- switch to `debugging` once the likely failure path is mapped

#### For impact analysis
- definition first
- major consumers second
- tests/config/docs/content surfaces third
- separate **must-update** from **maybe-affected**
- route to `code-refactoring` when the user is ready to change behavior-preserving structure

#### For config/content ownership
- locate loader/schema/template first
- then find runtime consumers or referenced pages/assets
- call out whether ownership sits in config, content metadata, templates, or code

#### For structural search
- explain the search shape in plain English
- prefer AST-aware tooling
- if forced to approximate with regex, label the confidence limit clearly

#### For archaeology requests
- start from entry points, docs, examples, tests, or build scripts
- avoid pretending you already understand the architecture after one search
- route to `graphify` if the user actually wants persistent structure mapping

### Step 7: Route out aggressively
Switch when the next job is no longer search:
- **Root cause, reproduction, hypotheses** → `debugging`
- **Raw log triage** → `log-analysis`
- **Behavior-preserving cleanup / codemod planning** → `code-refactoring`
- **Diff / PR judgment** → `code-review`
- **Persistent architecture graph or path tracing** → `graphify`

## Examples

### Example 1: Pre-change discovery
**Prompt:**
> Find where auth is implemented and what files I should inspect before changing it.

**Good response shape:**
- choose `symbol-indexed` or `exact-text`
- identify entry points, config, and tests
- return a compact evidence map
- route to `code-refactoring` or `debugging` only after the discovery step

### Example 2: Config/content ownership
**Prompt:**
> Which MDX pages still use the old pricing CTA shortcode, and where is the shared partial defined?

**Good response shape:**
- choose `config-content`
- search content metadata + shortcode/template surfaces
- identify source partial plus affected pages
- keep the answer discovery-first

### Example 3: Structural query
**Prompt:**
> Find all React effects missing cleanup. I do not want plain grep.

**Good response shape:**
- choose `structural`
- prefer AST-aware matching
- list highest-confidence hits
- label regex fallback limits if needed

### Example 4: Game/infrastructure archaeology
**Prompt:**
> Search this repo for where matchmaking region config is defined and what scenes or services consume it.

**Good response shape:**
- choose `config-content` or `symbol-indexed` based on repo shape
- separate config ownership from runtime consumers
- call out code + asset/build surfaces if they both matter

## Best practices
1. Choose the **smallest packet** that can answer the question.
2. Narrow scope before reading large match sets.
3. Return an evidence map, not a terminal transcript.
4. Cover config/content/game surfaces honestly; repo navigation is not only source-code lookup.
5. Separate search from diagnosis, refactoring, review, and persistent graphing.
6. Label confidence when structural intent is approximated with plain text search.
7. For monorepos, group findings by package or subsystem.

## References
- `references/intake-packets-and-route-outs.md`
- `references/search-modes.md`
- `references/evidence-map-template.md`
- `references/handoff-boundaries.md`
- GitHub Code Search syntax docs: https://docs.github.com/en/search-github/github-code-search/understanding-github-code-search-syntax
- Sourcegraph code search docs: https://sourcegraph.com/docs/code_search
- ast-grep introduction: https://ast-grep.github.io/guide/introduction.html
- ripgrep guide: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
