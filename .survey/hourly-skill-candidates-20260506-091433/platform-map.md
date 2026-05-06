# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey source | gh search repos | gh search repos | gh search repos | GitHub API |
| Evidence schema | JSON lanes map | JSON lanes map | JSON lanes map | validator contract |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | 5 lanes required | 5 lanes required | 5 lanes required | identical |
| Provenance labels | required | required | required | --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR gate | validator + diff check | validator + diff check | validator + diff check | must pass before merge |
| Post-PR | self-review comment | self-review comment | self-review comment | checks gate |

## Platform Gaps
1. CLI surface drift can break graphify/rtk subcommands.
2. Missing checks reporting blocks unattended merge.

Provenance: indexed snippet, direct page retrieval
