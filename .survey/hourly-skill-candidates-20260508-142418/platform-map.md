# Platform Map: oh-my-skills hourly automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Hourly run mode | Cron automation | Cron automation | Cron automation | Survey-first + artifact contract |
| PR lifecycle | gh CLI | gh CLI | gh CLI | Open-PR gate before new PR |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Required lanes | Same five keyword families | Same five keyword families | Same five keyword families | Deterministic lane coverage |
| Merge gate | No merge without green checks | No merge without green checks | No merge without green checks | Quality gate parity |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR gate | open PR triage | open PR triage | open PR triage | assess_open_pr_gate.py output |
| Blocker note | PR comment update | PR comment update | PR comment update | ASCII deterministic template |

## Platform Gaps
1. CI/check-reporting availability varies per branch; no-checks state prevents merge decisions.
2. Tooling output shape differences require strict JSON contracts in artifacts.
