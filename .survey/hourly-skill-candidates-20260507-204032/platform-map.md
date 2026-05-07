# Platform Map: oh-my-skills survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly survey lanes | Supported | Supported | Supported | Mandatory 5 lanes |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance label | Required | Required | Required | direct page retrieval/indexed snippet/thin evidence |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR open check | yes | yes | yes | open PR>0 then no new PR |

## Platform Gaps
1. no-checks-reported 상태에서는 merge 판단 자동화가 제한됨.
