# Platform Map: oh-my-skills hourly survey loop

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search provenance | survey lanes + citations | survey lanes + citations | survey lanes + citations | required provenance labels |
| Artifact schema | strict headings | strict headings | strict headings | validator script |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Merge gate | checks must pass | checks must pass | checks must pass | no green checks => no merge |
| Non-destructive changes | required | required | required | rollback section in PR |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery | keyword lanes | keyword lanes | keyword lanes | evidence.json/candidates.json |
| Knowledge pipeline | RTK + Graphify + Obsidian + LLM-Wiki | same | same | run artifact folder |
| PR review | checklist comment | checklist comment | checklist comment | self-review required |

## Platform Gaps
1. CLI availability differs by runtime; fallback handling must be explicit.
2. Check-run availability may be absent when CI is not bootstrapped.

Provenance: direct page retrieval
