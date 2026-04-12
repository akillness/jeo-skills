# Platform Map: Frontend skill consolidation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Tier-1 discovery | Compact skill metadata and description quality dominate activation | Same practical constraint in catalog-driven flows | Same practical constraint in catalog-driven flows | Canonical descriptions must carry the real trigger boundary |
| Skill packaging | Platform-specific wrappers may exist | Platform-specific wrappers may exist | Platform-specific wrappers may exist | Wrapper names should not masquerade as separate jobs when they are aliases |
| Support files | Progressive disclosure through linked references/AGENTS/evals | Same | Same | Put deeper support on the canonical skill |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Duplicate handling | Prefer one canonical skill per job | Prefer one canonical skill per job | Prefer one canonical skill per job | Merge or alias true duplicates instead of keeping peer descriptions |
| Split justification | Separate only if trigger text and evals can clearly distinguish them | Same | Same | Evals are the gate for keeping overlapping skills separate |
| Backward compatibility | Keep old names as compatibility aliases when needed | Same | Same | Preserve discoverability without preserving full duplication |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Install/setup | Setup prompt already includes duplicate link cleanup | Same setup surface can communicate canonical names | Same setup surface can communicate canonical names | Setup should expose canonical skill names and note aliases |
| Docs/index refresh | README and manifest act as catalog hubs | Same | Same | Update public inventory when a skill becomes canonical or alias-only |
| Validation | Validator checks trigger-oriented descriptions and section structure | Same | Same | Standardization should run on every changed skill |

## Platform Gaps
The repo already cleans duplicate platform links during setup, but README/setup/manifest surfaces still expose near-duplicate frontend skills as peers. The missing abstraction is a repo-wide canonical-alias policy for skill names, not a platform-specific feature.
