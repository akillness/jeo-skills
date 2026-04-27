# Platform Map: hourly survey resilience and candidate sweep

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey lane execution | Supported | Supported | Supported | Fixed five keyword families + evidence artifacts |
| Retrieval fallback | Required when degraded | Required when degraded | Required when degraded | `gh api "search/repositories?..."` fallback with provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Recommendation gates | Same | Same | Same | license + freshness + signal + fit |
| Artifact quality gate | Same | Same | Same | validator PASS (+ provenance where required) |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Survey loop | hourly | hourly | hourly | collect evidence, summarize, and propose low-risk patch |
| Pre-merge review | checklist | checklist | checklist | merge only on quality-gate pass |

## Platform Gaps
1. Search transport behavior can differ run-to-run; fallback artifacts are mandatory for auditability.
2. Candidate abundance varies by lane, so degraded-cause reporting must be explicit instead of hidden.
