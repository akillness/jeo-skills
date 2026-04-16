# Frontend design-system alias routing

`frontend-design-system` is a compatibility alias, not a peer frontend design skill.

## Use this alias when
- a user explicitly says `frontend-design-system`
- a setup script, sync job, or legacy prompt pack depends on the exact folder/name
- a migration pass must preserve backwards compatibility while converging on one canonical frontend UI-system entry

## Route to the canonical skill when
- the user wants a design system, component library, token plan, dashboard visual system, landing-page system, motion language, or accessibility-aware UI direction
- the request does not depend on the legacy alias name
- the work needs the actual design-system support files and route boundaries

Canonical target: `../design-system/SKILL.md`

## Required response pattern
1. Acknowledge that `frontend-design-system` is still supported for compatibility.
2. State that the canonical guidance now lives in `design-system`.
3. Continue the substantive work from `design-system`, not from the alias itself.
4. Preserve the alias name only where exact-name compatibility matters.

## Why this exists
The repo intentionally keeps one canonical design-system entry plus one thin compatibility alias. This matches the broader maintenance rule: preserve exact-name compatibility when it helps migrations, but keep ordinary activation pressure on the canonical skill.
