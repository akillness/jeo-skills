# Platform Map: hourly survey maintenance loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search execution | CLI/web tools | CLI/web tools | CLI/web tools | Run five keyword families + metadata gate |
| Artifact contract | markdown files | markdown files | markdown files | `.survey/{slug}` with triage/context/solutions/platform-map |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | Use explicit labels (`direct page retrieval`, etc.) |
| Relevance gate | required for repo-maintenance | required for repo-maintenance | required for repo-maintenance | Keep `license`, `pushed_at`, `archived`, fit rationale |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-edit check | skill/rule loading | skill/rule loading | skill/rule loading | Validate survey artifacts before implementation |
| Post-research | summary + PR notes | summary + PR notes | summary + PR notes | Include evidence links and risk notes |

## Platform Gaps
1. Search result quality differs per backend/tooling, so rescue seeds are needed when keyword lanes are sparse.
2. Web extract reliability varies; GitHub-native API fallback should be explicit for unattended loops.
