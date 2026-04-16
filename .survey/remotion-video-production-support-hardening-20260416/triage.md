# Triage
- Problem: `remotion-video-production` is correctly narrowed to a compatibility alias, but unlike the other alias lanes it still lacks a small `references/` packet that explains canonical routing, code-first defaults, and when to hand work back to the broader `video-production` skill.
- Audience: Agents and developers maintaining or invoking `oh-my-skills` creative-media skills, especially workflows that still name Remotion explicitly or depend on the legacy alias.
- Why now: The current graph shows support-gap cleanup is down to a tiny residue, and `remotion-video-production` is the only remaining alias-side `references/` holdout in the required game/media lane after the frontend alias PR was merged.
