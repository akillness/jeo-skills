# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Lane discovery | keyword + recovery | keyword + recovery | keyword + recovery | gh search repos JSON |
| Provenance | required labels in markdown | required labels in markdown | required labels in markdown | validator-enforced |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open PR gate | triage first | triage first | triage first | no duplicate PR when open exists |
| Merge gate | checks green only | checks green only | checks green only | block on no checks reported |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Artifact generation | scripted | scripted | scripted | .survey/<slug>/ package |
| Validation | strict validator | strict validator | strict validator | platform-topic + provenance |

## Platform Gaps
1. PR checks are not configured/reported on current branch, forcing blocker-only merge policy.
2. Recovery lanes can still return low-fit candidates requiring deterministic exclusion.
3. Multi-tool drift risk is reduced by persisted slug handoff and evidence contract checks.
