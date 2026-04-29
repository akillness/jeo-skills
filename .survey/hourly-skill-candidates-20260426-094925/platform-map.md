# Platform Map: hourly-skill-candidate-sweep

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact schema | markdown + validator | markdown + validator | markdown + validator | fixed headings + provenance labels |
| Retrieval defaults | web + gh fallback | web + gh fallback | web + gh fallback | indexed snippet then direct page retrieval |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required keyword lanes | same 5 families | same 5 families | same 5 families | deterministic hourly sweep |
| Promotion gate | relevance + freshness + signal | relevance + freshness + signal | relevance + freshness + signal | recommendation-grade keep policy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Post-search processing | lane metrics + status | lane metrics + status | lane metrics + status | pass/degraded + degraded_causes |
| Reporting | PR summary | PR summary | PR summary | evidence + risk + rollback |

## Platform Gaps
1. Search quality varies by lane; deterministic recovery queries are still required.
2. CLI field compatibility drift can break unattended runs unless supported JSON fields are pinned.
