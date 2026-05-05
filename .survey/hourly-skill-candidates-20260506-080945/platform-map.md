# Platform Map: hourly-skill-candidates

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey query lanes | supported | supported | supported | fixed 5-lane policy |
| Provenance labels | supported | supported | supported | validator-enforced |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | no merge on failed checks | no merge on failed checks | no merge on failed checks | hard gate |
| Lane degraded cause | explicit taxonomy | explicit taxonomy | explicit taxonomy | deterministic triage |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | gh search | gh search | gh search | evidence.json |
| Validation | survey validator | survey validator | survey validator | strict flags |

## Platform Gaps
1. Some environments lack graphify/rtk binaries; fallback artifacts required.
2. No-checks-reported state blocks merge despite valid docs changes.
