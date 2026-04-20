# Solution Landscape: skill-standardization alias-support sync ratchet

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| `skill-standardization` current baseline | SKILL.md + validator/catalog guidance | Already owns repo-root validator truth, duplicate handling, compact-surface sync | Alias-side support sync is implicit, not fully propagated into support references/evals | Repo-local baseline |
| Wiki memory only | Rely on prior run notes and query pages | Preserves nuance from earlier alias hardening passes | Easy to forget during future runs; not self-enforcing | `.agent-skills-wiki/log.md`, query pages |
| Script-only validation | `validate_skill.sh` + `validate_catalog_sync.py` | Fast, comparable, objective guardrails | Cannot inspect semantic drift inside alias support docs | Helpful but incomplete |
| Meta-skill ratchet | Encode alias-support sync directly in `skill-standardization` SKILL/reference/evals | Transferable across future canonical-vs-alias rewrites; keeps evaluator fixed | Requires small documentation + eval maintenance now | Best bounded improvement |

## Categories
- **Structural validators:** `validate_skill.sh`, `validate_catalog_sync.py`
- **Derived-surface sync:** `SKILL.toon`, `skills.json`, README/setup inventories
- **Alias-support sync:** alias-side `references/` / checklists / examples that mirror the canonical packet
- **Durable memory:** wiki pages and query logs that preserve prior ratchets

## What People Actually Use
In this repo, maintainers do not rely on validators alone. The durable pattern has been:
1. canonicalize duplicate skills,
2. add a thin alias packet,
3. sync top-level discovery surfaces,
4. use wiki notes and residue scans to catch whatever the scripts miss.

The friction is that step 4 is still partly social memory. When alias-side docs exist, they become a real behavioral layer before the canonical skill opens.

## Frequency Ranking
1. Script + manual review hybrid (`validate_skill.sh`, `validate_catalog_sync.py`, residue scan)
2. Wiki-assisted canonical-vs-alias maintenance
3. Explicit alias-side support hardening in individual skills
4. Fully encoded meta-skill rule for alias-side support sync (currently incomplete)

## Key Gaps
- No explicit eval in `skill-standardization` for alias-side support-sync expectations.
- `references/working-modes.md` does not yet make alias-side support review as visible as compact/discovery review.
- A maintainer can succeed on spec + catalog checks while leaving stale alias support packets untouched.

## Contradictions
- Marketed/obvious contract: standardization is about SKILL.md, evals, and catalog surfaces.
- Repo reality: once aliases have their own support packets, those support docs are part of the live contract too.

## Key Insight
The highest-value bounded fix is not another validator or another alias helper skill. It is to ratchet `skill-standardization` itself so canonical-vs-alias work explicitly treats alias-side support docs as first-class derived surfaces alongside `SKILL.toon`, manifests, and README/setup inventories. That keeps future canonical rewrites transferable and reduces dependence on remembering prior wiki notes.
