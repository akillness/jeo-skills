# Solution Landscape: survey artifact-validator hardening

## Solution List
| Name | Approach | Strengths | Weaknesses | Notes |
|------|----------|-----------|------------|-------|
| Keep `survey` as-is | No structural change beyond the 2026-04-18 hardening | Already validated by `validate_skill.sh`; zero migration risk | Leaves `survey` on the oversized front-door watchlist and keeps artifact validation prose-only | Acceptable baseline, not the best next step |
| Move verbose output templates to a new reference | Keep the routing/evidence/artifact contract in `SKILL.md`, but move longer template blocks into `references/` | Matches the repo's router-first pattern; reduces front-door size without changing semantics | Can over-thin the front door if the contract itself is moved out | Strong doc-structure improvement |
| Add a reusable survey artifact validator script | Validate required files, headings, and basic provenance/platform-map rules after a survey run | Fills the clearest missing capability; matches repo precedent for truthful validators | Needs careful scope control so it validates structure, not subjective research quality | Best bounded functional improvement |
| Extend evals for artifact-contract and reuse cases | Add evals for platform-map enforcement, artifact-shape fidelity, and reuse-vs-overwrite decisions | Low-risk extension of an existing maintenance surface | Evals alone do not guarantee that on-disk artifacts are valid | Best companion change |
| Create a new adjacent survey wrapper | Add another skill for repo-maintenance surveying or platform comparison | Superficially isolates behavior | Duplicates the canonical `survey` role and raises trigger ambiguity | Bad fit; avoid |
| Push more behavior into platform hooks/config | Depend on Claude/Gemini hooks or platform-native config instead of repo-local contract files | Nice acceleration where supported | Regresses portability; contradicts the current survey reference | Bad fit; avoid |

## Categories
### Best bounded next move
- Add a reusable survey artifact validator script.
- Extend evals so the validator and artifact contract stay inside the frozen harness.

### Best doc-shape cleanup
- Move long output-template blocks into a support reference while keeping the core contract in `SKILL.md`.

### Baseline / defer
- Keep `survey` as-is if this run chooses to spend effort elsewhere.

### Rejected directions
- Add a new wrapper skill around `survey`.
- Make hooks/config the primary source of truth instead of repo-local markdown plus post-generation validation.

## What People Actually Use
In this repo, the durable pattern is not "new survey tool" but "tighten the current front door in place." Recent hardening passes across many skills repeatedly shrink the main skill, add or refine `references/`, refresh `evals/evals.json`, and sync discovery surfaces. `survey` already follows that pattern, which makes a validator script plus one more front-door compaction pass more consistent than either a wrapper skill or hook-heavy platform branching.

## Frequency Ranking
1. Front-door shrink via `references/` while keeping the contract in `SKILL.md`
2. Extend or refresh `evals/evals.json`
3. Add a truthful validator script where the contract is stable enough to check mechanically
4. Keep the current state unchanged
5. Add a new adjacent wrapper
6. Lean harder on platform hooks/config over repo-local contract files

## Key Gaps
- `survey` still lacks a survey-local script even though its support reference explicitly recommends a validator pattern.
- The artifact schema is stable, but template prose still occupies a lot of main-skill space.
- Reuse and freshness decisions remain policy-driven rather than lightly checked.

## Contradictions
- The repo's dominant maintenance direction says dense-anchor cleanup matters more than adding wrappers, yet `survey` still carries a large amount of template prose in the main skill.
- The platform adapter says hooks are optional accelerators around a validator, but `survey` currently ships the recommendation without the validator.
- Evals prove trigger quality and fallback behavior, but they do not yet fully mechanize artifact-schema compliance.

## Key Insight
The best follow-up is not another research wrapper. It is to finish turning `survey` into the kind of durable router the rest of the repo now prefers: keep the canonical artifact contract in checked-in markdown, move slower-changing template detail into a support reference, and add one small portable validator command so Claude, Codex, Gemini, and cron loops all enforce the same survey output shape.

## Curated Sources
- `.agent-skills/survey/SKILL.md`
- `.agent-skills/survey/references/evidence-recovery-ladder.md`
- `.agent-skills/survey/references/platform-adapter-and-artifact-contract.md`
- `.agent-skills/survey/evals/evals.json`
- `.agent-skills/skill-standardization/SKILL.md`
- `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- `.agent-skills/omc/scripts/validate-omc.sh`
- `.agent-skills/omx/scripts/validate-omx.sh`
- `graphify-out/GRAPH_REPORT.md`
- `README.md`
- `.agent-skills-wiki/queries/survey-structural-hardening-2026-04-18.md`