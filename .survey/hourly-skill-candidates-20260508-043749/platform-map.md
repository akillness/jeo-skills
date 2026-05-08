# Platform Map: hourly skill survey loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact shape | required | required | required | shared validator contract |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | validator-supported labels |
| Merge gate on checks | required | required | required | no checks reported => block |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | scheduled | scheduled | scheduled | five mandatory lanes + recovery |

## Platform Gaps
1. Missing CI checks on branch protection still blocks safe merge in unattended mode.
