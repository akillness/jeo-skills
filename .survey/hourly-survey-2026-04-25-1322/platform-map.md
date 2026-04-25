# Platform Map: hourly-survey-2026-04-25-1322

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search provider credentials | `web_search` returned 401 INVALID_API_KEY in this environment | Same shared tool backend behavior expected | Same shared tool backend behavior expected | Treat external search credential state as runtime dependency; fallback to GitHub-native retrieval |
| GitHub API auth | `gh auth status` valid (repo/read/write scopes) | same local CLI token | same local CLI token | Prefer authenticated `gh` for metadata rescue (`license`, `pushed_at`, `archived`) |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Hourly keyword sweep contract | Keep required five keyword families | Same | Same | Always execute five families before final recommendations |
| Relevance gate | Keep metadata minimum + freshness floor | Same | Same | Keep/drop decisions must include explicit metadata and fit rationale |
| Degraded reporting | Existing taxonomy misses transport/auth | Same | Same | Add `transport/auth` as compact degraded cause category |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-recommendation validation | survey validator script | survey validator script | survey validator script | `validate_survey_artifacts.py` enforces structure/provenance |
| Recovery on search outage | Use GitHub-native fallback + provenance labels | Same | Same | Outage should be logged as `transport/auth` not silently mapped to `low-fit` |

## Platform Gaps
1. External web search auth failures are not represented in current degraded-cause taxonomy, so outage events can be misclassified.
2. Lane-quality metrics exist but root-cause comparability across hourly runs is weaker without explicit transport/auth labeling.
3. No artifact schema change is needed; taxonomy expansion is sufficient and backward-compatible.
