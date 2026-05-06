# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search source | GitHub search | GitHub search | GitHub search | indexed snippet provenance |
| Recovery policy | stage1/stage2 query rescue | stage1/stage2 query rescue | stage1/stage2 query rescue | feed recovery provenance |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | block if no checks | block if no checks | block if no checks | hard quality gate |
| Provenance | must label markdown | must label markdown | must label markdown | validator --require-provenance |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Preflight | open PR backlog sampling | open PR backlog sampling | open PR backlog sampling | gh pr list plus gh pr checks |
| Post-PR | self-review comment | self-review comment | self-review comment | no self-approve |

## Platform Gaps
1. No checks reported on branch prevents merge completion.
2. Metadata schema drift for license fields requires normalization.
