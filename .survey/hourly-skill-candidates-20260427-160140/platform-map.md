# Platform Map: hourly-skill-candidates

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey evidence capture | JSON artifacts | JSON artifacts | JSON artifacts | `.survey/<slug>/evidence.json` |
| Provenance labels | Required | Required | Required | validator-enforced |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Mandatory lanes | yes | yes | yes | 5 fixed keyword families |
| Quality gate | license/freshness/signal/fit | same | same | standardized policy |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Pre-PR validation | survey validator | survey validator | survey validator | `--platform-topic --require-provenance` |
| Merge gate | checks + self-review | checks + self-review | checks + self-review | no checks=no merge |

## Platform Gaps
1. Graphify query behavior differs by graph schema shape; fallback paths are still required.
2. Obsidian CLI may fail in headless runtimes and needs deterministic file-write fallback.
