# Loop Charter

## Goal
Improve the practical usefulness of `.agent-skills/remotion-video-production` without reviving it as a peer to `video-production`.

## Current Baseline
- `video-production` is the canonical programmable-video / automated-video skill with `references/`, `evals/`, and a compact surface.
- `remotion-video-production` is already a compatibility alias with evals and compact discovery, but it still lacks a small `references/` packet.
- The graph and wiki identify this alias as the remaining creative-media support holdout after the frontend alias PR merged.

## Mutable Artifact
Primary: `.agent-skills/remotion-video-production/SKILL.md`

Supporting files allowed only if the primary direction proves useful:
- `.agent-skills/remotion-video-production/references/*`
- `.agent-skills/remotion-video-production/SKILL.toon`
- `.agent-skills/remotion-video-production/evals/evals.json`
- graph / survey / wiki artifacts documenting the same decision
- README / README.ko / setup prompt only if discoverability wording materially changes

## Fixed Evaluation Harness
- Skill must pass `bash .agent-skills/skill-standardization/scripts/validate_skill.sh .agent-skills/remotion-video-production`
- Repo catalog must pass `python3 .agent-skills/skill-standardization/scripts/validate_catalog_sync.py`
- Alias must remain explicitly subordinate to `video-production`
- Updated support packet must improve explicit Remotion routing and alternative-mode route-outs versus baseline
- No new overlapping video/media skill may be added in this run

## Constraints
- Max one coherent improvement set this run
- Prefer 1-2 small reference packets over large support-doc sprawl
- Keep the change transferable across explicit Remotion requests, legacy prompts, and setup-surface compatibility
- Do not change the evaluator mid-run
- Do not commit directly to `main`

## Tried Already
- Keep: canonicalized `video-production` and narrowed `remotion-video-production` into an alias on 2026-04-14
- Revert: keeping both skills as equal peers or adding another media wrapper
- Why: the lane boundary is already correct; the remaining gap is support symmetry and route clarity
