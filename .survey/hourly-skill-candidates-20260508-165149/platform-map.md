# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly lane coverage | yes | yes | yes | mandatory 5-lane sweep |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | checks green only | checks green only | checks green only | no-checks => blocker comment |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| open PR present | append to existing PR branch | append to existing PR branch | append to existing PR branch | avoid duplicate PRs |

## Platform Gaps
1. No-checks-reported branches block autonomous merge path.
2. Need stable CI bootstrap policy to reduce backlog churn.

Provenance labels: indexed snippet, feed recovery.
