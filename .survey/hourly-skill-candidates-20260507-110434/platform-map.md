# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey cadence | hourly cron | hourly cron | hourly cron | repo automation schedule |
| Evidence source | GitHub search/API | GitHub search/API | GitHub search/API | indexed snippet provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | enforce 5 lanes | enforce 5 lanes | enforce 5 lanes | identical lane contract |
| Provenance labels | required | required | required | validator enforces |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Preflight | PR backlog + checks sample | same | same | gate decision |
| Post-run | PR + self-review | same | same | merge only on green checks |

## Platform Gaps
1. Missing CI checks on hourly branches blocks fully automated merge.
2. Search metadata shape variance can cause license classification drift.
