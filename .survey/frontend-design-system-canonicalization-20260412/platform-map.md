# Platform Map: frontend design-system canonicalization

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Skill discovery | Relies heavily on short catalog metadata before full instructions load | Same pressure: concise metadata drives first-pass selection | Same pattern for catalog-triggered skill routing | Canonical name, description, tags, and examples must cleanly separate default vs alias |
| Deep guidance loading | Full skill body only matters after selection | Same | Same | Duplicate metadata is more dangerous than duplicate deep content |
| Inventory surfaces | README/setup prompts influence install and browsing | Same | Same | Docs must reflect canonical-vs-alias status |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Duplicate handling | Prefer one canonical skill plus a compatibility alias when names/descriptions collide | Same | Same | Merge near-duplicates at the metadata layer before adding new skills |
| Trigger quality | Canonical skill should own ordinary prompts | Same | Same | Alias stays narrow and exact-name oriented |
| Docs consistency | Setup and inventories must not hide the canonical choice | Same | Same | Update README, README.ko, setup prompt, and manifest together |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-research | Check graph/wiki memory for known duplicate clusters | Same | Same | Reuse prior durable findings before re-surveying from scratch |
| Post-change validation | Validate SKILL.md structure and eval JSON | Same | Same | Frozen harness: skill validator + trigger-quality rubric |
| Post-run memory | Refresh graph report and wiki notes | Same | Same | Durable structural + narrative memory should compound over time |

## Platform Gaps
No major vendor-specific difference matters here. The important abstraction is repository-level: metadata, alias policy, and inventory consistency. The problem is shared across Claude, Codex, and Gemini because all three depend on compact discovery surfaces before loading deeper skill content.
