# Platform Map: Hourly survey automation

## Settings
| Concern | Claude | Codex | Gemini | Common Layer |
|---------|--------|-------|--------|--------------|
| Evidence collection | tool calls with provenance labels | tool calls with provenance labels | tool calls with provenance labels | indexed snippet + direct page retrieval labels |
| Unattended execution | cron safe, deterministic files | cron safe, deterministic files | cron safe, deterministic files | fixed slug propagation |

## Rules
| Concern | Claude / OMC | Codex / OMX | Gemini / OHMG | Common Layer |
|---------|---------------|-------------|---------------|--------------|
| Open PR gate | no duplicate PR when open PR exists | same | same | triage existing PR first |
| Merge gate | block when no checks reported | same | same | comment blocker + remediation |

## Hooks
| Lifecycle | Claude | Codex | Gemini | Common Layer |
|-----------|--------|-------|--------|--------------|
| Hourly start | open PR scan | open PR scan | open PR scan | gh pr list --state open |
| Pre-merge | checks query | checks query | checks query | no checks => no merge |

## Platform Gaps
1. Some runtimes have tool/CLI drift for Graphify or Obsidian, requiring deterministic file-write fallbacks.
2. CI check absence blocks auto-merge; branch-level progress must still be preserved with blocker guidance.
