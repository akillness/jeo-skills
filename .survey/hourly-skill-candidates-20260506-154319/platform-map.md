# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search source | gh search repos | gh search repos | gh search repos | GitHub API/indexed snippet |
| Provenance label | indexed snippet | indexed snippet | indexed snippet | validator-accepted labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | 5 lanes fixed | 5 lanes fixed | 5 lanes fixed | same keyword families |
| Gate before merge | checks green | checks green | checks green | no-checks => hold |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Artifact gen | script | script | script | .survey/<slug>/ package |
| Validation | validator | validator | validator | --platform-topic --require-provenance |

## Platform Gaps
1. gh pr checks가 `no checks reported`를 반환하면 병합이 막힌다.
2. 일부 lane은 시점에 따라 raw_count가 급감해 recovery query가 필요하다.
