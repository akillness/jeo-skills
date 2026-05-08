# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Lane evidence schema | Compatible | Compatible | Compatible | evidence.json lane map |
| Provenance requirement | Required | Required | Required | validator --require-provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Promotion gate | signal+fit+freshness | signal+fit+freshness | signal+fit+freshness | deterministic lane metrics |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | collect lanes | collect lanes | collect lanes | write .survey/hourly-skill-candidates-20260508-012212 artifacts |

## Platform Gaps
1. CI checks are not configured on carry-forward PR branch (`no checks reported`).
