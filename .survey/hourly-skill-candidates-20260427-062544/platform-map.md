# Platform Map: hourly-skill-candidates

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence capture | Search + notes | Search + notes | Search + notes | JSON evidence schema + provenance labels |
| Lane recovery | Alternate queries | Alternate queries | Alternate queries | Recovery query contract |
| Quality gate | Manual review assist | Script + validator | Script + validator | Validator with --platform-topic --require-provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required keyword lanes | Enforced | Enforced | Enforced | 5 fixed families |
| Promotion threshold | Signal + freshness + license | Signal + freshness + license | Signal + freshness + license | recommendation-grade gate |
| Degraded reporting | Explicit causes | Explicit causes | Explicit causes | lane_status + degraded_causes taxonomy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | Repo search | Repo search | Repo search | Persist raw lane JSON |
| Refinement | Summarize findings | Summarize findings | Summarize findings | RTK + Graphify outputs |
| Delivery | PR narrative | PR narrative | PR narrative | Self-review checklist + merge gate |

## Platform Gaps
1. CLI/search surface inconsistencies can lower lane recall quality.
2. Headless note tooling may fail and require direct file-write fallback.
3. Graph query schema drift can require fallback graph JSON generation.
