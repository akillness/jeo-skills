# Platform Map: hourly-skill-maintenance

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Survey artifact schema | `.survey/{slug}` markdown contract | same | same | fixed filenames + required headings |
| Evidence transport | web_search may degrade | gh CLI fallback stable | gh CLI fallback stable | use `gh search` + `gh api` when needed |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Provenance labels | required | required | required | use validator-approved labels |
| Degraded lane reporting | required | required | required | `lane_status` + `degraded_causes` |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| survey validation | validator script | validator script | validator script | `validate_survey_artifacts.py` |
| metadata fallback | gh api | gh api | gh api | direct page retrieval |

## Platform Gaps
1. Hosted web extraction key failures still happen; GitHub-native fallback works but must be logged clearly.
2. Zero-result lanes need structured transcript fields to stay auditable in unattended runs.

## Provenance
- indexed snippet
- direct page retrieval
