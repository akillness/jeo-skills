# Catalog Sync Checklist

Use this checklist whenever a skill is added, renamed, removed, or materially repositioned.

## Source of truth
1. Start from the live filesystem: every installable skill should have `./.agent-skills/<name>/SKILL.md`.
2. Treat catalog/index artifacts as derived surfaces, not independent truth.
3. When a rename creates a canonical skill + compatibility alias, make sure both folder names and frontmatter names still match their directories.

## Surfaces to verify
- `.agent-skills/skills.json`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`
- token-optimized discovery variants such as `SKILL.toon` or `SKILL.compact.md` when the repo/runtime ships them
- any query or list tooling that loads the catalog (for this repo, `skill-query-handler.py`)

## What to check
### 1. Catalog membership
- every live skill folder appears in `skills.json`
- removed/renamed skills are not left behind as stale manifest entries
- category groupings reflect the live repo structure closely enough that users can find specialist lanes

### 2. Path and naming integrity
- manifest `name` matches folder name
- manifest `path` points to the live `SKILL.md`
- compatibility aliases are labeled as aliases instead of equal peers

### 3. Discovery copy
- README and setup prompt counts match the live folder count
- inventories include newly added specialist clusters when they materially affect discovery
- setup prompts do not advertise removed skills

### 4. Compact discovery variants
- if `SKILL.md` changed the trigger surface or supported use-cases materially, refresh `SKILL.toon` / `SKILL.compact.md`
- compact variants should preserve the current default job-to-be-done and major route-outs, not stale legacy wording
- if no compact variant update was needed, be able to explain why the rewrite was non-material for runtime discovery

### 5. Runtime behavior
- query/list tooling should still find live skills even if the manifest is stale
- manifest metadata can enrich search terms, but it should not hide filesystem skills

## Keep / revert rule
- **Keep** changes that reduce silent drift and improve discovery for multiple future runs.
- **Revert** changes that only patch one count/string while leaving runtime discovery brittle.
