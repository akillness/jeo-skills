# Platform Map: oh-my-skills hourly survey

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Mandatory lanes | Supported | Supported | Supported | Enforced in artifacts |
| Provenance labels | Supported | Supported | Supported | Validator requires accepted labels |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| No-checks merge block | Keep PR open | Keep PR open | Keep PR open | Hard gate in workflow |
| Recovery query requirement | stage1+stage2 | stage1+stage2 | stage1+stage2 | Recorded in evidence.json |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Artifact generation | Scripted | Scripted | Scripted | .survey/<slug>/ package |
| Validation | Scripted | Scripted | Scripted | strict validator flags |

## Platform Gaps
1. Search metadata schema can vary for license fields, requiring normalization and fallback enrichment.
2. Branch-level checks may be unconfigured, preventing safe auto-merge despite valid content updates.
