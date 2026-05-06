# Platform Map: hourly skill candidate survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence source | indexed snippet | indexed snippet | indexed snippet | GitHub API/search |
| Provenance label | direct page retrieval | indexed snippet | indexed snippet | validator-accepted labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | enforce 5 lanes | enforce 5 lanes | enforce 5 lanes | same lane contract |
| Merge gate | block on no checks | block on no checks | block on no checks | no-checks hard block |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| preflight | backlog sampling | backlog sampling | backlog sampling | gh pr list/checks |
| artifacts | triage/context/solutions/platform-map | same | same | validator strict |
| merge | squash when green | squash when green | squash when green | explicit rollback |

## Platform Gaps
1. gh search schema drift 시 lane degraded 오탐 가능
2. Graphify query 서브커맨드/스키마 변동성으로 fallback 필요
