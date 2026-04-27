# Platform Map: oh-my-skills survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact contract | Skill-guided markdown package | Skill-guided markdown package | Skill-guided markdown package | `.survey/{slug}` fixed files + validator |
| Provenance labels | Requires validator-accepted labels | Requires validator-accepted labels | Requires validator-accepted labels | `indexed snippet` / `direct page retrieval` |
| Hourly operation | Cron-friendly with fallback logic | Cron-friendly with fallback logic | Cron-friendly with fallback logic | deterministic lane status + degraded causes |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Lane coverage | Must run all five keyword families | Must run all five keyword families | Must run all five keyword families | same five-lane sweep contract |
| Recommendation gate | metadata + freshness + signal + fit | metadata + freshness + signal + fit | metadata + freshness + signal + fit | recommendation-grade keep policy |
| Degraded reporting | lane_status + degraded_causes | lane_status + degraded_causes | lane_status + degraded_causes | include no-results when raw_count==0 |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | artifact validator + diff check | artifact validator + diff check | artifact validator + diff check | `validate_survey_artifacts.py --platform-topic --require-provenance` |
| PR review | self-checklist comment | self-checklist comment | self-checklist comment | merge only on green quality gates |
| Failure handling | leave PR open with root cause | leave PR open with root cause | leave PR open with root cause | no merge on failed validation/checks |

## Platform Gaps
1. Tooling availability differs (e.g., Obsidian CLI may be absent), so file-write fallback must remain first-class.
2. External search transport reliability varies; GitHub-native retrieval fallback is mandatory.
3. Graph query schema/runtime drift can break query output, requiring documented fallback artifacts.

Provenance labels used in this file: indexed snippet, direct page retrieval.
