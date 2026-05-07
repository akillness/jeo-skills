# Platform Map: survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Open-PR gate | Enforced | Enforced | Enforced | `gh pr list --state open` first |
| Evidence capture | JSON + MD | JSON + MD | JSON + MD | `.survey/<slug>/evidence.json` |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| No new PR when open PR exists | required | required | required | hard gate policy |
| Provenance labels | required | required | required | validator `--require-provenance` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly trigger | cron | cron | cron | branch triage then survey |
| Merge gate | checks green only | checks green only | checks green only | `gh pr checks` |

## Platform Gaps
1. Branches with no reported checks block merge despite clean merge state.
2. Survey quality can drift without strict template/heading regeneration.
