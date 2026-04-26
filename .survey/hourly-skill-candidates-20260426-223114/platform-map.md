# Platform Map: hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Tool-call limits | Variable | Variable | Variable | Keep branch/PR lifecycle prioritized after validation |
| Search source | API/search | API/search | API/search | Prefer indexed snippet evidence with provenance labels |
| Headless notes | CLI/file fallback | CLI/file fallback | CLI/file fallback | Obsidian direct file write fallback |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance | Required label in markdown | Required label in markdown | Required label in markdown | Accept validator-approved labels |
| Lane coverage | 5 required keyword families | 5 required keyword families | 5 required keyword families | Recovery pass if empty/noisy |
| Merge gate | No merge on failed/absent checks | No merge on failed/absent checks | No merge on failed/absent checks | Deterministic blocker reporting |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Discovery hook | survey run | survey run | survey run | write `.survey/<slug>/evidence.json` |
| Validation hook | validator + diff check | validator + diff check | validator + diff check | strict provenance requirement |
| PR hook | body + self-review checklist | body + self-review checklist | body + self-review checklist | merge only after gates pass |

## Platform Gaps
1. Some lanes can return many low-fit repos despite high stars; requires explicit overlap gate.
2. Graph tooling schema drift can degrade queryability; fallback artifact needed.
3. Headless environments may fail URI-based note operations; direct file-write must remain available.
