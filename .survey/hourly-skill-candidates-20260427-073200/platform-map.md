# Platform Map: hourly license-quality gate

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Search transport failure | fallback to GitHub-native retrieval | same | same | `gh search repos` + `gh api` + transport_status log |
| Recommendation license gate | apply open SPDX allowlist + exception note | same | same | deterministic keep criteria |
| Evidence persistence | `.survey/<slug>/evidence.json` | same | same | validator-compatible markdown + JSON |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| 5-keyword sweep | required | required | required | agentic/web-frontend/web-backend/cli/game |
| Lane status | pass/degraded | pass/degraded | pass/degraded | include degraded_cause `license` when needed |
| Provenance labels | required | required | required | direct page retrieval / indexed snippet |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| discovery | keyword sweep + rescue | same | same | quality gate + evidence JSON |
| validation | survey artifact validator | same | same | heading/provenance checks |
| review | self-checklist + merge gate | same | same | no merge on failed quality gate |

## Platform Gaps
1. Search transport credentials can degrade independently from GitHub API access.
2. License semantics are not uniform across all `license` values; `Other` needs explicit treatment.
3. Obsidian URI actions can fail in headless cron, requiring direct file-write fallback.

## Sources
- https://docs.github.com/en/rest/licenses/licenses#get-the-license-for-a-repository (direct page retrieval)
- https://docs.github.com/en/rest/repos/repos#get-a-repository (direct page retrieval)
- https://github.com/akillness/oh-my-skills/blob/main/.agent-skills/survey/references/keyword-sweep-and-relevance-rescue.md (direct page retrieval)
