# Platform Map: oh-my-skills hourly survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey query execution | CLI/API based | CLI/API based | CLI/API based | Required 5-lane keyword sweep |
| Provenance labels | markdown labels | markdown labels | markdown labels | validator-enforced labels |
| Metadata recovery | direct page retrieval | direct page retrieval | direct page retrieval | `gh api repos/<owner>/<repo>` fallback |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Keep gate | overlap+signal+metadata | overlap+signal+metadata | overlap+signal+metadata | same pass/degraded contract |
| Degraded taxonomy | license/stale/low-fit/archived/low-signal/no-results | same | same | shared report schema |
| Concentration check | required | required | required | `recommended_lane_count` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| discovery | keyword sweep | keyword sweep | keyword sweep | evidence.json |
| recovery | staged fallback query | staged fallback query | staged fallback query | query_trace |
| quality gate | validator + diff check | validator + diff check | validator + diff check | merge only on gates pass |

## Platform Gaps
1. Search payloads may omit complete license data; direct page retrieval is needed for deterministic metadata gating.
2. Some lanes produce high-noise keyword matches; stage2 query escalation must remain deterministic.
3. Unattended runs need strict artifact templates to avoid validator drift.
