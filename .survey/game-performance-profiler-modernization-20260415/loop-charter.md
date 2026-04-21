# Loop Charter

## Goal
Improve the existing `game-performance-profiler` skill so it better matches real Unity/Unreal performance triage workflows: quick stat/screenshot packets, reproducible benchmark routes, packaged-on-target/device review, and escalation from engine-native profiling to deeper GPU tools.

## Current Baseline
- The skill already classifies bottleneck buckets and outputs a concise profiling brief.
- It already has one reference doc and three evals.
- It still under-emphasizes quick triage packets, reproducible route/capture hygiene, packaged-vs-editor/device branching, and support/discovery symmetry (`SKILL.toon`, richer references, sharper doc wording).

## Mutable Artifact
Primary mutable artifact: `.agent-skills/game-performance-profiler/SKILL.md`

Supporting artifacts allowed if the primary change is kept:
- `.agent-skills/game-performance-profiler/references/*`
- `.agent-skills/game-performance-profiler/evals/evals.json`
- `.agent-skills/game-performance-profiler/SKILL.toon`
- catalog/discovery surfaces that must stay in sync (`README.md`, `README.ko.md`, `setup-all-skills-prompt.md`, `.agent-skills/skills.json`, `.agent-skills/skills.toon`)
- survey/wiki/graph artifacts for this run

## Fixed Evaluation Harness
- Agent Skills structure expectations from `skill-standardization`
- Existing repo conventions from nearby modernized skills
- Validation script: `.agent-skills/skill-standardization/scripts/validate_skill.sh`
- Catalog sync validator: `.agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Representative prompts:
  1. Unity combat spike with profiler screenshot and suspected GC
  2. Unreal open-world traversal hitch with stat/gpu ambiguity
  3. Steam Deck pre-demo review with only overlay/screenshots and no packaged-device trace yet
  4. Screenshot-only evidence packet where a route/capture checklist is the right next artifact
- Success criteria:
  - sharper trigger wording and route-outs
  - references/evals/support files reflect the real-world survey findings
  - no new overlapping skill added
  - docs/manifests stay in sync

## Constraints
- Max scope: one skill modernization in this run
- Prefer bounded, transferable improvements over broader game-cluster rewrites
- Do not change evaluation criteria mid-run
- Do not create a new skill unless the existing one clearly cannot absorb the improvement
- Preserve compatibility with existing game-cluster boundaries (`bmad-gds`, `game-demo-feedback-triage`, `game-build-log-triage`, `steam-store-launch-ops`, `performance-optimization`)

## Tried Already
- Keep: modernize existing anchors instead of adding overlapping wrappers
- Keep: refresh discovery surfaces when skill positioning changes materially
- Revert: adding noisy duplicate skills for narrow adjacent workflows
- Why: the wiki and graph history show the repo improves most when high-visibility anchors get clearer boundaries and better support coverage
