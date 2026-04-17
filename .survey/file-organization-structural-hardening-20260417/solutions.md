# Solution Landscape: file-organization structural hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Current repo `file-organization` skill | Large all-in-one front door plus support references | Correct cross-domain boundary already exists; references and evals are present; README/setup surfaces already index it | Main `SKILL.md` still carries too much mode detail, output scaffolding, and examples for a discovery surface | Best bounded move is to harden in place |
| Existing repo references (`repo-shape-decision-guide`, `migration-playbook`, `repo-type-patterns`) | Focused support docs for decision ladder, migration, and repo-type patterns | Already contain most of the durable detail the front door needs to route into | Main skill still duplicates large chunks instead of deferring to them | Lean on these harder rather than creating new wrappers |
| Next.js project structure docs | Framework-default primary source | Confirms framework/file conventions should be the default starting point | Only covers one ecosystem | Good grounding for framework-default mode |
| GitHub Well-Architected monorepos | Architecture guidance for monorepo decisions | Confirms monorepo structure is a deliberate architecture choice | Not an agent-facing front door | Good grounding for workspace/monorepo notes |
| Diátaxis | Task-based documentation taxonomy | Reinforces docs-by-user-need instead of org-history folders | Documentation-specific, not repo-wide | Good grounding for docs-taxonomy mode |
| Unity organizing-your-project guidance | Engine-aware project-organization guidance | Confirms team-based asset/code organization and version-control considerations for game projects | Game/Unity-specific | Good grounding for engine-aware hybrid notes |
| Adjacent repo skills (`codebase-search`, `workflow-automation`, `system-environment-setup`, `design-system`, `state-management`, `bmad-gds`) | Boundary companions | Already own search, automation, runnable environments, subsystem-specific structure, and game-production routing | The main skill still repeats some of their territory in the front door | Tight route-outs are more valuable than another structure wrapper |

## Categories
- **Repo-local canonical surface**: `file-organization`, existing references, compact discovery file, evals
- **Framework-default grounding**: Next.js project structure docs
- **Monorepo grounding**: GitHub Well-Architected monorepos
- **Docs-taxonomy grounding**: Diátaxis
- **Game-project grounding**: Unity organizing-your-project guidance
- **Boundary companions**: `codebase-search`, `workflow-automation`, `system-environment-setup`, `design-system`, `state-management`, `bmad-gds`

## What People Actually Use
In practice, repository-shape work clusters into a few repeated packets:
1. keep framework defaults until route or feature sprawl justifies more structure,
2. switch to feature/domain grouping when changes span UI/state/api/tests/docs together,
3. move to `apps/` + `packages/libs/` only when multiple deployables or genuinely shared packages exist,
4. organize docs around user task and content type rather than author history,
5. keep engine-mandated roots while adding naming and ownership rules for game/content repos,
6. migrate incrementally instead of renaming every path in one pass.

The repo already knows these patterns, but the main skill still carries too much explanatory bulk instead of acting like a compact router into those packets.

## Frequency Ranking
1. Current repo `file-organization` skill — the live reusable surface that needs structural cleanup
2. Existing repo references — already the right place for durable details, but still underused by the front door
3. Next.js project structure docs — canonical framework-default grounding
4. GitHub Well-Architected monorepos — canonical monorepo architecture grounding
5. Diátaxis — canonical docs-taxonomy grounding
6. Unity organizing-your-project page — canonical game-project organization grounding
7. Adjacent repo skills — essential route-outs, not replacements

## Key Gaps
- The main `SKILL.md` is still too long for a routing-first discovery surface.
- Repo-type walkthroughs and example outputs still live in the front door instead of the support files.
- The front door should emphasize one chosen organization mode plus a boundary packet, not an exhaustive mini-handbook.
- `SKILL.toon` and eval coverage should keep reflecting the sharper route boundary after shortening the front door.

## Contradictions
- The repo’s current maintenance pattern favors smaller front doors with focused references, but `file-organization` still behaves like a blended front door + handbook.
- The skill says it should avoid cargo-culting one folder tree, yet the front door still spends many lines on per-repo-type walkthroughs that work better as reference material.

## Key Insight
The right move is not another project-structure wrapper and not another conceptual rewrite. The right move is a structural hardening pass: keep `file-organization` as the repository-shape and migration anchor, shrink `SKILL.md` into a mode-selecting router, let the existing support docs carry the detailed repo-type guidance, refresh the compact surface, and keep route-outs to search, automation, environment setup, subsystem-specific structure, and game-production planning unmistakable.
