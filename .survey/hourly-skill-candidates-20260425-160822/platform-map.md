# Platform Map: oh-my-skills hourly survey (hourly-skill-candidates-20260425-160822)

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifacts | `.survey/{slug}/*` | `.survey/{slug}/*` | `.survey/{slug}/*` | Fixed artifact contract + validator |
| Provenance labels | Manual markdown labels | Manual markdown labels | Manual markdown labels | Use validator-accepted labels only |
| Run slug integrity | Required for downstream tools | Required for downstream tools | Required for downstream tools | Single persisted slug reused everywhere |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Keyword sweep | 5 mandatory families | 5 mandatory families | 5 mandatory families | Deterministic lane coverage |
| Relevance gate | Metadata + fit + freshness + signal | Metadata + fit + freshness + signal | Metadata + fit + freshness + signal | Recommendation-grade keeps only |
| Merge policy | Merge only on green validation | Merge only on green validation | Merge only on green validation | No merge on failed gates |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | run validator + diff checks | run validator + diff checks | run validator + diff checks | `validate_survey_artifacts.py` + `git diff --check` |
| Knowledge capture | RTK/Graphify/Obsidian/LLM-Wiki | RTK/Graphify/Obsidian/LLM-Wiki | RTK/Graphify/Obsidian/LLM-Wiki | Structured artifacts + wiki note |

## Platform Gaps
1. Graphify query compatibility can degrade when graph schema differs (`links` vs `edges`).
2. Obsidian URI actions may fail in headless cron contexts; direct vault write fallback is required.
3. Provider-side web search limits may require GitHub-native retrieval fallback while preserving provenance.
