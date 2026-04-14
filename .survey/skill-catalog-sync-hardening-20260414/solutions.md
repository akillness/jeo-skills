# Solution Landscape: skill catalog sync hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Filesystem-first runtime catalog | Build the runtime skill catalog from live `SKILL.md` folders, then optionally enrich from a manifest | Immediately stops stale manifests from hiding real skills; low-risk bounded change | Does not automatically repair docs/manifests by itself | Best immediate safety improvement for `skill-query-handler.py` |
| Manifest validator / sync checker | Compare live skill folders against `skills.json`, README/setup counts, and other discovery surfaces | Catches drift early; reusable during maintenance loops | Still leaves two sources of truth unless regeneration is added | Strong bounded companion improvement |
| Generated manifest from filesystem metadata | Treat folders/frontmatter as source of truth and emit `skills.json` | Eliminates most manual drift | Requires generator design and adoption | Best long-term architecture direction |
| Per-skill descriptor aggregation | Keep canonical metadata in each skill folder and aggregate at build time | Good ownership model; rename/delete safety | Larger repo workflow change | Similar to Backstage/plugin descriptor patterns |
| Continue manual edits only | Keep patching visible drifts by hand | Lowest immediate effort | Proven to drift repeatedly | Not durable |

## Categories
- **Immediate runtime protection**: filesystem-first loading in discovery/query tooling.
- **Maintenance guardrails**: sync/validation scripts and explicit checklist steps.
- **Long-term architecture**: generated manifests from folder/frontmatter state.

## What People Actually Use
Across content/plugin ecosystems, durable catalogs are usually derived from file/folder conventions or validated schema-backed content collections. Manual central registries survive mostly when they are generated or CI-checked. The practical lesson is simple: runtime discovery should trust the live source of truth, and committed indexes should be treated as derived artifacts.

## Frequency Ranking
1. Filesystem/schema as source of truth.
2. Validation during build/CI.
3. Generated manifest checked into the repo or emitted during builds.
4. Manual central manifest maintenance as a fallback only.

## Key Gaps
- This repo has SKILL.md validation but no equivalent catalog-sync validation.
- Discovery docs and setup prompts are not being checked against the live folder set.
- Runtime query behavior currently allows stale manifest data to outrank live filesystem state.

## Contradictions
- Marketed repo state: docs imply one coherent 85-skill catalog.
- Actual repo state: live filesystem count is higher, renamed/removed entries persist in `skills.json`, and game-specialist skills are missing from key discovery surfaces.

## Key Insight
The highest-value bounded improvement is not inventing another catalog layer. It is hardening the existing repo so the live filesystem becomes authoritative for runtime discovery, while a reusable validation/checklist path catches manifest and docs drift before it compounds.
