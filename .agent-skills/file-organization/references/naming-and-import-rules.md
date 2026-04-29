# Naming and Import Rules

A folder strategy fails if naming and imports ignore the boundary model.

## Folder naming
- Prefer one consistent convention (`kebab-case` or framework-standard folder names).
- Name folders by responsibility, not by vague implementation detail.
- Avoid junk-drawer names like `misc`, `common2`, `helpers-final`, or `stuff`.

## File naming
- Follow framework/language conventions when they are meaningful.
- Keep special/reserved files exactly where the framework expects them.
- Use suffixes only when they communicate stable meaning (`.test`, `.spec`, `.stories`, `.types`).

## Public API rules
- If features or packages expose a boundary file, make it explicit and small.
- Do not use wildcard barrels to hide ownership and accidentally widen imports.
- Prefer imports through the intended public boundary rather than deep sibling-folder reach-ins.

## Shared promotion rule
Code should move from feature-local to shared only when:
1. it is reused across multiple features/apps,
2. ownership stays clear,
3. the abstraction is stable enough not to churn weekly.

## Bad smells
- Deep relative imports crossing sibling features
- Shared folders that contain mostly one-off code
- Route-level files importing random app internals with no public boundary
- Package boundaries that still rely on lots of deep private imports
