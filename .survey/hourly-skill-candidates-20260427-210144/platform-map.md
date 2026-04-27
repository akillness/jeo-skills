# Platform Map: oh-my-skills hourly survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly survey trigger | cron/system prompt | cron/system prompt | cron/system prompt | fixed five-lane survey contract |
| Evidence transport fallback | API + direct retrieval | API + direct retrieval | API + direct retrieval | provenance-labeled fallback path |
| Merge gate | checks + validator | checks + validator | checks + validator | do not merge on validation/check failure |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Artifact structure | triage/context/solutions/platform-map required | same | same | validator-enforced headings |
| Lane quality | lane_status + degraded_causes required | same | same | deterministic taxonomy |
| Recovery escalation | lane templates from survey references | same | same | stage-1 then stage-2 escalation policy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR checks | scripted validation hooks | scripted validation hooks | scripted validation hooks | `validate_survey_artifacts.py` + diff checks |
| Review packaging | PR template comments | PR template comments | PR template comments | evidence/risk/rollback sections |
| Merge decision | gate-aware merge | gate-aware merge | gate-aware merge | merge only on green quality gate |

## Platform Gaps
1. CLI/tool output formats differ, so fallback parsing and deterministic artifact paths are still required.
2. Search transport quality can vary by environment, requiring explicit provenance labeling.
3. Self-approval constraints on PR review differ from merge permissions and must be handled by checklist comments.
