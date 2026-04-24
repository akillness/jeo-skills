# Platform Map: oh-my-skills hourly candidate survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact contract | `.survey/{slug}` markdown + validator | same | same | fixed file/heading schema |
| Evidence fallback | web->GitHub-native | web->GitHub-native | web->GitHub-native | provenance labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | validate + self-review before merge | same | same | no merge on failed gate |
| Risk handling | explicit rollback in PR | same | same | non-destructive diff |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly trigger | cron | cron | cron | recurring maintenance loop |
| Post-survey action | branch+PR | branch+PR | branch+PR | PR-based delivery |

## Platform Gaps
1. Runtime web search reliability differs; GitHub-native fallback is required.
2. Self-approval semantics differ by platform API, so checklist comments are safer.
