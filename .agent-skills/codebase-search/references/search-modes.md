# Search modes

Use the lightest search mode that can answer the question.

## 1. Exact-text search
Best for:
- known strings
- env vars
- route paths
- log/error text
- config keys
- imports you already know

Strengths:
- fastest default
- works everywhere
- easy to scope by path/file type

Failure mode:
- noisy when the same token appears across many layers

## 2. Symbol / indexed search
Best for:
- definitions
- references / call sites
- interfaces / classes
- public API ownership
- monorepo navigation

Strengths:
- cleaner than grep for true symbol lookup
- often better for references and large repos

Failure mode:
- not always available locally
- may not capture generated/dynamic behavior

## 3. Structural search
Best for:
- syntax-shape matching
- unsafe patterns
- codemod prep
- repeated framework/API usage with the same shape

Strengths:
- lower false positives when syntax matters
- better for migration prep than plain regex

Failure mode:
- more setup and tooling overhead
- language support / parser details matter

## 4. File discovery
Best for:
- locating config files
- migrations
- tests/examples
- engine/build scripts
- package/subsystem boundaries

Strengths:
- good first move in unfamiliar repos
- reveals structure before content search

Failure mode:
- does not explain behavior on its own

## Practical ladder
1. file discovery if you do not know where to look
2. exact-text search for known terms
3. symbol search for references/definitions
4. structural search when text search is too blunt
5. targeted file reading + evidence map before any route-out
