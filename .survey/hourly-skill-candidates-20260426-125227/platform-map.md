# Platform Map: oh-my-skills hourly survey maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| survey run mode | repo-maintenance | repo-maintenance | repo-maintenance | fixed five-lane sweep |
| evidence contract | provenance labels required | provenance labels required | provenance labels required | validator-backed schema |
| freshness/signal floors | enabled | enabled | enabled | shared gate policy |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| required headings | validator enforced | validator enforced | validator enforced | triage/context/solutions/platform-map |
| lane recovery trigger | deterministic thresholds | deterministic thresholds | deterministic thresholds | raw_count/kept_count/zero-star ratio |
| merge guard | no merge on failed gates | no merge on failed gates | no merge on failed gates | quality gate first |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| pre-implement | survey + validator | survey + validator | survey + validator | artifact-first workflow |
| pre-merge | self-review checklist | self-review checklist | self-review checklist | explicit gate decision |
| post-run | wiki/log update | wiki/log update | wiki/log update | compounding knowledge |

## Platform Gaps
1. Search quality varies per session; fallback queries and provenance labels are required.
2. Headless environments can break interactive integrations; file-write fallback is needed.
3. Missing PR checks must be treated as merge blockers.

Provenance label used: indexed snippet.
