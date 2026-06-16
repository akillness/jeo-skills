---
name: skill-standardization
description: >
  Standardize and validate SKILL.md files against the Agent Skills specification
  (agentskills.io). Use when creating or rewriting a skill, auditing an existing
  skill for spec compliance, sharpening trigger descriptions, canonicalizing
  overlapping skills into a canonical skill plus compatibility alias, or checking
  whether derived discovery surfaces (`skills.json`, README/setup inventories,
  `SKILL.toon`, `SKILL.compact.md`) still match the live skill folders. In
  repo-root maintenance loops, prefer truthful validator commands instead of bare
  `scripts/...` examples. Triggers on: "validate skill", "create SKILL.md",
  "check skill spec", "skill frontmatter", "improve skill description",
  "catalog sync", "SKILL.toon drift", "compact skill drift", "canonical skill".
allowed-tools: Bash Read Write Edit Glob Grep
compatibility: Designed for Claude Code and compatible agent clients with filesystem access
metadata:
  tags: skill-management, standardization, validation, agentskills-spec, automation, deduplication, catalog-sync
  version: "2.3"
---

# Skill Standardization

## When to use this skill

- Creating a new `SKILL.md` from scratch
- Auditing an existing skill for Agent Skills spec compliance
- Repairing weak trigger descriptions or stale route-outs
- Canonicalizing duplicate skills into a default skill plus compatibility alias
- Validating repo-level discovery/catalog drift after add/rename/remove/alias work
- Reviewing `SKILL.toon` / `SKILL.compact.md` drift after material rewrites

## Instructions

### Step 1: Pick the smallest working mode
Use `references/working-modes.md` and pick exactly one primary mode:
1. validate or repair one existing skill
2. create or rewrite a `SKILL.md`
3. canonicalize duplicates
4. structural catalog / discovery sync
5. derived-surface sync after a material rewrite

Do not start with a giant blended pass if one of those modes answers the job.

### Step 2: Run the truthful validator command for the current working directory
For `jeo-skills` repo-root maintenance loops, use:

```bash
bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/<skill-name>
```

If you are running from inside `.agent-skills/skill-standardization`, use the skill-local form from `references/working-modes.md` instead. Do not copy bare `scripts/...` commands into repo-root runbooks unless the current cwd really makes them valid.

The validator checks:
- required frontmatter (`name`, `description`)
- directory-safe naming
- description length and imperative trigger phrasing
- recommended sections
- file-length warning

Repo-specific validator nuance:
- `validate_skill.sh` is expected to accept valid multiline `description: >` blocks that contain ordinary apostrophes or shell-like text. If it still fails on prose-level quoting, treat that as a validator bug to repair, not as a reason to weaken the skill description.
- Prefer fixing the validator or adding a regression case before rewriting natural language just to appease shell parsing.

### Step 3: Fix or write the primary `SKILL.md`
When creating or rewriting the skill:
- keep the description trigger-oriented and specific about when to use the skill
- make the default job-to-be-done obvious before listing edge cases
- keep the front door routing-first; move slower-changing examples/checklists/templates to `references/` when they start to crowd the main skill
- keep `SKILL.md` under 500 lines and preferably much smaller when the skill is a high-frequency router

Use the compact template and legacy heading map in `references/working-modes.md` instead of copying a bloated starter by hand.

### Step 4: Improve description quality before polishing anything else
A weak description means the skill never activates. Use this pattern:

```yaml
description: >
  [What it does — list specific operations.]
  Use when [trigger conditions]. Even if the user does not explicitly
  mention [domain keyword] — also triggers on: [synonym list].
```

Description rules:
1. use imperative phrasing — "Use when..."
2. describe user intent, not internal implementation
3. include edge triggers and nearby synonyms
4. stay under 1024 characters
5. keep route-outs truthful when adjacent skills should win

### Step 5: Add evals whenever the behavior changed materially
Create or refresh `evals/evals.json` when you add a skill, rewrite its trigger surface, or narrow it into an alias.

Good eval coverage includes:
- a normal prompt that should clearly trigger the skill
- a near-miss prompt that should route elsewhere
- a structural-change prompt that checks catalog/discovery sync when relevant
- compact/discovery-surface checks when `SKILL.toon` / `SKILL.compact.md` matter in the repo

Keep assertions concrete and verifiable.

### Step 6: Canonicalize duplicates instead of letting them compete
When two skills cover the same default job closely enough that their `name + description` metadata competes:
1. pick the canonical skill
2. sharpen the canonical description so it wins ordinary prompts
3. convert the overlapping skill into a narrow compatibility alias when old workflows or exact-name installs still depend on it
4. add evals for both sides
5. sync discovery surfaces in the same change so users do not see two false peers
6. if the alias includes support docs or examples that restate the canonical contract, refresh those alias-side docs too so they do not keep advertising the pre-ratchet packet shape

Hard deletion is usually a later step, not the first move.

### Step 7: Run structural catalog sync after add / rename / remove / alias / major repositioning work
For repo-level drift in `jeo-skills`, use:

```bash
python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /Users/jang_jennie/projects/jeo-skills
```

Portable form:

```bash
python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /path/to/repo
```

Treat the catalog validator as a guardrail, not the whole job. It checks membership/count/path drift, but it does not replace manual review of derived discovery wording or compact freshness.

### Step 8: Sync derived discovery surfaces when the rewrite was material
If `SKILL.md` changed the job-to-be-done, route-outs, or supported use-cases materially, review and refresh as needed:
- skill-local `SKILL.toon` / `SKILL.compact.md`
- alias-side support docs or checklists that mirror the canonical contract
- `.agent-skills/skills.json`
- `.agent-skills/skills.toon`
- `README.md`
- `README.ko.md`
- `setup-all-skills-prompt.md`

If one of those surfaces does not need a change, be able to explain why.

### Step 9: Do a residue scan before calling the pass done
After support-heavy or structural rewrites, search for obvious residue:
- stale filenames or paths
- removed command examples
- old canonical-vs-alias wording
- compact/discovery text that still advertises the old job

Keep the pass only if the result is more truthful and transferable than the baseline.

## Available scripts

- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh <skill-dir>` — validate one skill
- `bash .agent-skills/skill-standardization/scripts/validate_skill.sh --all .agent-skills/` — batch validation
- `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /path/to/repo` — compare live folders against catalog/discovery surfaces
- `bash .agent-skills/skill-standardization/scripts/regression_folded_description_quotes.sh [repo-root]` — regression-check folded descriptions with apostrophes / shell-like text

## Examples

### Example 1: Validate one skill from repo root

```bash
bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/my-skill
```

### Example 2: Batch validate the whole repo

```bash
bash .agent-skills/skill-standardization/scripts/validate_skill.sh --all .agent-skills/
```

### Example 3: Check catalog/discovery sync after a rename or alias change

```bash
python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py --repo-root /path/to/repo
```

Use this after adding, renaming, removing, or canonicalizing a skill so stale manifest entries, wrong inventory counts, and forgotten derived-surface updates do not linger.

### Example 4: Fix common frontmatter issues

```yaml
# WRONG
metadata:
  tags: [tag1, tag2]
  platforms: Claude

# CORRECT
metadata:
  tags: tag1, tag2
allowed-tools: Bash Read Write
```

## Best practices

1. **Description quality first** — weak descriptions mean the skill never activates
2. **Shrink high-frequency routers** — move slower-changing detail to `references/` before the front door turns into a handbook
3. **Use truthful command paths** — match repo-root vs skill-local execution context explicitly
4. **Keep scripts non-interactive and structured** — prefer flags and machine-readable output
5. **Add evals before publishing** — cover should-trigger, should-not-trigger, and structural-change cases
6. **Treat compact/discovery files as derived artifacts** — refresh them after material rewrites or document why not
7. **Canonicalize duplicates instead of multiplying peers** — prefer one default skill plus a compatibility alias
8. **Sync alias-side support when the canonical contract changes** — if the alias has checklists, references, or examples that restate the old packet shape, update them in the same pass so the alias does not quietly preserve stale guidance
9. **Run residue scans after structural rewrites** — passing validators can still leave stale filenames, commands, or discovery copy behind

## References

- [Agent Skills Specification](https://agentskills.io/specification)
- [Optimizing Descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- [Evaluating Skills](https://agentskills.io/skill-creation/evaluating-skills)
- [Using Scripts](https://agentskills.io/skill-creation/using-scripts)
- [Adding Skills Support](https://agentskills.io/client-implementation/adding-skills-support)
