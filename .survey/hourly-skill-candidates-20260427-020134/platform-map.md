# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search lanes | keyword family sweep | keyword family sweep | keyword family sweep | 5 mandatory lane contract |
| Provenance labels | markdown labels required | markdown labels required | markdown labels required | validator-approved labels only |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Recommendation gate | license/freshness/signal | license/freshness/signal | license/freshness/signal | dedup-aware recommendation-grade keep set |
| Degraded causes | lane-level report | lane-level report | lane-level report | include no-results when raw_count=0 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | cron maintenance | cron maintenance | cron maintenance | generate evidence.json + validated markdown artifacts |
| Post-survey | PR packaging | PR packaging | PR packaging | self-review and merge gate |

## Platform Gaps
1. No built-in shared primitive for cross-lane dedup metrics; each runtime can over-count lane diversity without explicit guard.
2. Tooling variance around search fields can break unattended runs unless supported field sets are enforced.
3. Provenance labels drift unless validator-approved labels are hardcoded in templates.
