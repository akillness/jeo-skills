# Working Modes

Use the smallest mode that solves the maintenance problem.

## Mode 1 — Validate or repair one existing skill
Best for frontmatter, section, trigger-description, and size hygiene on a single folder.

### Repo-root commands (`jeo-skills` workflow)
```bash
bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/<skill-name>
```

### Skill-local alternative
```bash
cd .agent-skills/skill-standardization
bash scripts/validate_skill.sh ../<skill-name>
```

### What this validator covers
- required frontmatter (`name`, `description`)
- name format and directory match
- description length and imperative trigger phrasing
- quote-safe folded-description extraction for ordinary prose (apostrophes, backticks, shell-like text)
- recommended sections
- file-length warning

### What you still review manually
- whether route-outs are truthful
- whether examples match the repo's actual workflow
- whether `SKILL.toon` / `SKILL.compact.md` need refresh after a material rewrite
- whether a new parser edge case deserves a durable regression check such as `scripts/regression_folded_description_quotes.sh`

## Mode 2 — Create or rewrite a SKILL.md
Use when there is no good `SKILL.md` yet or the current one is too weak to keep.

### Compact starter template
```markdown
---
name: skill-name
description: >
  [What it does and specific operations it handles.]
  Use when [trigger conditions]. Triggers on: [keyword list].
allowed-tools: Bash Read Write Edit Glob Grep
metadata:
  tags: tag1, tag2, tag3
  version: "1.0"
---

# Skill Title

## When to use this skill
- Scenario 1
- Scenario 2

## Instructions
### Step 1: [Action]
### Step 2: [Action]

## Examples
### Example 1: [Scenario]

## Best practices
1. Practice 1

## References
- [Link](url)
```

### Legacy heading map
| Legacy heading | Standard heading |
|----------------|-----------------|
| `## Purpose` | `## When to use this skill` |
| `## When to Use` | `## When to use this skill` |
| `## Procedure` | `## Instructions` |
| `## Best Practices` | `## Best practices` |
| `## Reference` | `## References` |
| `## Output Format` | `## Output format` |

## Mode 3 — Canonicalize duplicates
Use when two skills compete for the same default job.

### Keep the canonical skill focused
- sharpen the canonical description so it wins ordinary prompts
- narrow the legacy/exact-name skill into a compatibility alias
- add evals that prove canonical-vs-alias behavior
- sync discovery surfaces in the same pass
- if the alias has support docs, examples, or checklists that restate the canonical packet, refresh those alias-side docs too

## Mode 4 — Structural catalog / discovery sync
Use after add / rename / remove / alias / major repositioning work.

### Repo-root commands (`jeo-skills` workflow)
```bash
python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/jeo-skills
```

### Portable form
```bash
python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /path/to/repo
```

### What the catalog validator covers
- live skill folders vs `skills.json`
- manifest path existence
- recorded skill count
- README / README.ko / setup prompt count surfaces

### What you still review manually
- `SKILL.toon` / `SKILL.compact.md` freshness after material rewrites
- alias wording and discovery copy quality
- alias-side support docs/checklists/examples that may still mirror the pre-ratchet canonical packet
- stale manifest command examples or other support-file residue
- runtime/query tooling behavior when a change affects discovery semantics

## Mode 5 — Derived-surface sync
Use when `SKILL.md` changed the trigger surface, route-outs, or supported use-cases materially.

Check these surfaces together:
- skill-local `SKILL.toon` / `SKILL.compact.md`
- alias-side support docs/checklists/examples when a compatibility alias mirrors the canonical contract
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

If you leave a discovery surface unchanged, be able to explain why the rewrite was non-material for that surface.
