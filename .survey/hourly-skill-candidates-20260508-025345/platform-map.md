# Platform Map: Oh-My-Skills Hourly Survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence packaging | Supported | Supported | Supported | .survey/<slug> artifacts |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance requirement | required | required | required | validate_survey_artifacts.py --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly run | scheduler | scheduler | scheduler | open-PR gate then survey lanes |

## Platform Gaps
1. Missing PR checks blocks unattended merge despite valid artifacts.
