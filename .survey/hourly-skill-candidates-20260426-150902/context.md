# Context: oh-my-skills hourly survey loop

## Workflow Context
The hourly loop runs survey discovery over five keyword families, applies relevance/freshness/signal gates, and promotes recommendation-grade candidates into mergeable skill updates. In this run, all lanes degraded because `license` was unavailable in candidate metadata despite active, high-traction repositories.

## Affected Users
| Role | Responsibility | Skill Level |
|------|----------------|-------------|
| Skill maintainer | Land low-risk skill improvements via PR + merge | advanced |
| Reviewer | Validate evidence quality and gate truthfulness | advanced |
| Automation operator | Keep hourly loop healthy and non-degenerate | intermediate |

## Current Workarounds
1. Keep raw evidence but mark lanes degraded (`license` cause) when metadata is unknown.
2. Manually inspect candidate repositories to recover license signals.
3. Avoid merging broad policy changes when lane health appears artificially poor.

## Adjacent Problems
- Single-lane concentration and all-lane degradation can be falsely triggered by retrieval-layer metadata gaps.
- Noisy keyword hits become harder to triage when high-quality candidates are filtered out early.
- Recommendation quality metrics drift if metadata retrieval is not robust.

## User Voices
- "`gh repo view ... --json licenseInfo` returned null for many active repos." — direct page retrieval
- "`gh api repos/<owner>/<repo> --jq .license.spdx_id` returned concrete SPDX (`MIT`) for the same repo." — direct page retrieval

Provenance: indexed snippet, direct page retrieval
