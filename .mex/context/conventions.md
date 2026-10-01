---
name: conventions
description: How code is written in this project — naming, structure, patterns, and style. Load when writing new code or reviewing existing code.
triggers:
  - "convention"
  - "pattern"
  - "naming"
  - "style"
  - "how should I"
  - "what's the right way"
edges:
  - target: context/architecture.md
    condition: when a convention depends on understanding the system structure
  - target: context/catalog-pipeline.md
    condition: when the verify checklist item touches skills.json/README/TOON/frontmatter validation
  - target: patterns/catalog-metadata-changes.md
    condition: when actually adding a skill or editing catalog metadata, not just reading conventions
grounds_to:
  - node: "function:d1051005f6e64620c707377e84b51b8f"
    fingerprint: "mh:64:7b226d696e68617368223a5b31303735373637372c383234323735382c313734323230333331362c313734373032383530312c3131353631373238332c343934303038362c333731363237332c313132383132323236302c313632323932313031322c3839363934333638362c313739313038392c3235303632313336392c3130393434393032372c333535323234382c3130373237373734312c3437373732323937312c3231343636333331352c31333330313134372c33383336333737362c393735373732303030312c343130313436353230392c37383533383736342c33333438333937382c313230363935383533392c383533353230393932312c363235373630373933342c323032373631363731312c3534313139313834392c37353738343333322c3437373732323937312c3132323139353631322c313330383438383236312c3331333536323535312c3133343232353733372c39363638313435393435312c38313731313735322c3234353936313834332c3231323533313736322c31383237313939383433322c3735353132353634362c3230393530363431302c33323838363832342c313938393437323335332c3134353838333835312c3130363937343833313432312c3239383731313831392c313131363739353137382c3438303138303130382c343036363734343437322c3535393930303836352c343434333831313731392c39303031373634392c3632303735323834382c3439313934313134332c3232353333303231322c313330313437313239392c33313736303835342c3339343033343635322c3934393533383339352c3237383832313138312c37303230383532362c35343139343937332c3230383132302c31313732363932355d2c226e65696768626f7273223a5b5d2c22746f6b656e436f756e74223a34367d"
last_updated: 2026-08-19
---

# Conventions

## Naming
- Skill folder name, its manifest `name`, and its containing directory in
  `.agent-skills/<name>/SKILL.md` must all be identical — enforced by
  [`safe_manifest_path()`](mex://function:d1051005f6e64620c707377e84b51b8f), which
  rejects any manifest `path` that is absolute, escapes `.agent-skills` via `..`, is not
  named `SKILL.md`, or does not live in a folder named exactly `skill_name`.
- Tooling scripts under `scripts/` are hyphenated by CLI-facing purpose
  (`validate-catalog-projections.py`, `repair-skill-frontmatter.py`), while their
  internal functions use snake_case (`validate_manifest`, `repair_document`).
- Manifest JSON keys are snake_case: `skill_count`, `subcategory`,
  `relationship_groups`, `retired_skills`, `replacement_type`.
- Internal/non-public helper functions are prefixed with `_`
  (`_validate_retired_ledger`, `_parse_ledger`, `_desc`, `_replace_description`,
  `_set_difference_message`).

## Structure
- One skill = one flat directory: `.agent-skills/<name>/SKILL.md`, optionally with its
  own `scripts/`, `references/`, etc. inside — never nested under a category folder.
- All catalog taxonomy (category, subcategory, interface, tags, bundle membership,
  relationship groups, retirement) lives once in `.agent-skills/skills.json`; a
  `SKILL.md`'s own frontmatter carries only `name`, `description`, `allowed-tools`, and
  optional `metadata` — never a duplicated category/tag list.
- Root-level `scripts/` holds catalog-wide governance tooling (validation, repair,
  ledger, link census) and is distinct from any individual skill's own `scripts/`
  subfolder under `.agent-skills/<name>/scripts/`.
- A script that is safe to run in CI exposes `main() -> int` and a non-mutating flag
  (`--check`, `--dry-run`, or `--self-test-*`); anything without one of those flags is
  assumed to write files and must not be wired into a CI step directly.

## Patterns
Validators never mutate; repair scripts always require an explicit non-mutating flag to
be CI-safe. `validate_manifest()` and friends raise `ValidationError` via a `require()`
helper and never touch the filesystem for writes:
```python
# validate-catalog-projections.py — read, check, raise; never write
require(declared_count == len(skills),
        f"manifest.skill_count is {declared_count}, but manifest.skills has {len(skills)} entries")
```
`scripts/repair-skill-frontmatter.py`, by contrast, writes by default — CI must invoke
it with `--check` (see `.github/workflows/ci.yml`), never bare.

Deprecate, don't delete: a superseded script becomes a thin shim that warns and
delegates, so old invocations (docs, muscle memory, other automation) can't silently
corrupt data again. `fix_frontmatter.py` no longer parses anything itself — it locates
and calls `scripts/repair-skill-frontmatter.py` and exits non-zero if that file is
missing.

## Verify Checklist
Before presenting any change touching the catalog:
- [ ] If `.agent-skills/skills.json` changed: `python3 scripts/validate-catalog-projections.py` passes
- [ ] If any `SKILL.md` frontmatter changed: `python3 scripts/repair-skill-frontmatter.py --check` passes
- [ ] If any `.agent-skills/` folder was added/moved: `python3 flatten_skills.py --dry-run` reports no pending moves
- [ ] A new/changed skill's manifest `path` is exactly `<name>/SKILL.md`, and `name` equals the folder name
- [ ] `skill_count` in skills.json still equals the length of `skills[]`, and the skill appears in exactly one `categories[]` entry and one `subcategories[category][subcategory]` entry
- [ ] If the skill was added to or removed from a `bundles[]` entry or a `relationship_groups[]` entry, that reference list has no dangling/unknown names
